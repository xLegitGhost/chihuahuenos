import { Inject, Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface SeatLockResult {
  success: boolean;
  conflictingSeat?: number;
  expiresAt: string;
}

export interface SeatLockInfo {
  sessionId: string;
  expiresAt: string;
}

interface MemoryLockEntry {
  sessionId: string;
  expiresAtMs: number;
}

const ACQUIRE_OR_RENEW_LUA = `
local current = redis.call("GET", KEYS[1])
if (not current) or (current == ARGV[1]) then
  redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[2]))
  return 1
end
return 0
`;

const RELEASE_IF_OWNER_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

@Injectable()
export class RedisLockService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly memoryLocks = new Map<string, MemoryLockEntry>();
  private redisClient: Redis | null = null;
  private redisAvailable = false;

  constructor(@Optional() @Inject(ConfigService) private readonly configService?: ConfigService) {
    const redisHost = this.configService?.get<string>('REDIS_HOST') ?? process.env.REDIS_HOST;
    const redisPort = Number(this.configService?.get<string>('REDIS_PORT') ?? process.env.REDIS_PORT ?? 6379);
    const useInMemory =
      (this.configService?.get<string>('USE_IN_MEMORY_DB') ?? process.env.USE_IN_MEMORY_DB) === 'true' ||
      process.env.NODE_ENV === 'test';

    if (redisHost && !useInMemory) {
      this.redisClient = new Redis({
        host: redisHost,
        port: redisPort,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
      });

      this.redisClient.on('ready', () => {
        this.redisAvailable = true;
        this.logger.log(`Connected to Redis at ${redisHost}:${redisPort}`);
      });

      this.redisClient.on('error', (err) => {
        if (this.redisAvailable) {
          this.logger.warn(`Redis connection lost, falling back to in-memory lock store: ${err.message}`);
        }
        this.redisAvailable = false;
      });

      this.redisClient.connect().catch((err) => {
        this.logger.warn(`Redis unavailable (${err.message}); using atomic in-memory lock store.`);
        this.redisAvailable = false;
      });
    } else {
      this.logger.log('Using atomic in-memory seat lock store.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit().catch(() => undefined);
    }
  }

  private buildKey(routeId: string, seatNumber: number): string {
    return `lock:route:${routeId}:seat:${seatNumber}`;
  }

  private pruneExpiredMemoryLock(key: string): void {
    const existing = this.memoryLocks.get(key);
    if (existing && existing.expiresAtMs <= Date.now()) {
      this.memoryLocks.delete(key);
    }
  }

  private async acquireSingleKey(
    key: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<{ acquired: boolean; wasAlreadyOwner: boolean }> {
    if (this.redisClient && this.redisAvailable) {
      try {
        const previous = await this.redisClient.get(key);
        const result = await this.redisClient.eval(ACQUIRE_OR_RENEW_LUA, 1, key, sessionId, ttlSeconds);
        return {
          acquired: Number(result) === 1,
          wasAlreadyOwner: previous === sessionId,
        };
      } catch (err) {
        this.logger.warn(`Redis eval failed, falling back to memory lock: ${(err as Error).message}`);
        this.redisAvailable = false;
      }
    }

    // Synchronous critical section ensures strict atomicity across concurrent async requests in JS.
    this.pruneExpiredMemoryLock(key);
    const existing = this.memoryLocks.get(key);
    if (!existing || existing.sessionId === sessionId) {
      const wasAlreadyOwner = existing?.sessionId === sessionId;
      this.memoryLocks.set(key, {
        sessionId,
        expiresAtMs: Date.now() + ttlSeconds * 1000,
      });
      return { acquired: true, wasAlreadyOwner };
    }
    return { acquired: false, wasAlreadyOwner: false };
  }

  private async releaseSingleKey(key: string, sessionId: string): Promise<void> {
    if (this.redisClient && this.redisAvailable) {
      try {
        await this.redisClient.eval(RELEASE_IF_OWNER_LUA, 1, key, sessionId);
        return;
      } catch {
        this.redisAvailable = false;
      }
    }

    this.pruneExpiredMemoryLock(key);
    const existing = this.memoryLocks.get(key);
    if (existing && existing.sessionId === sessionId) {
      this.memoryLocks.delete(key);
    }
  }

  async acquireSeatsLock(
    routeId: string,
    seatNumbers: number[],
    sessionId: string,
    ttlSeconds = 600,
  ): Promise<SeatLockResult> {
    const uniqueSortedSeats = [...new Set(seatNumbers)].sort((a, b) => a - b);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const newlyAcquiredKeys: string[] = [];

    for (const seatNumber of uniqueSortedSeats) {
      const key = this.buildKey(routeId, seatNumber);
      const { acquired, wasAlreadyOwner } = await this.acquireSingleKey(key, sessionId, ttlSeconds);

      if (!acquired) {
        // Roll back only the new locks created in this call so previously owned locks remain untouched.
        for (const rollbackKey of newlyAcquiredKeys) {
          await this.releaseSingleKey(rollbackKey, sessionId);
        }
        return {
          success: false,
          conflictingSeat: seatNumber,
          expiresAt,
        };
      }

      if (!wasAlreadyOwner) {
        newlyAcquiredKeys.push(key);
      }
    }

    return { success: true, expiresAt };
  }

  async releaseSeatsLock(routeId: string, seatNumbers: number[], sessionId: string): Promise<void> {
    const uniqueSeats = [...new Set(seatNumbers)];
    for (const seatNumber of uniqueSeats) {
      await this.releaseSingleKey(this.buildKey(routeId, seatNumber), sessionId);
    }
  }

  async forceClearSeatsLock(routeId: string, seatNumbers: number[]): Promise<void> {
    const uniqueSeats = [...new Set(seatNumbers)];
    for (const seatNumber of uniqueSeats) {
      const key = this.buildKey(routeId, seatNumber);
      if (this.redisClient && this.redisAvailable) {
        try {
          await this.redisClient.del(key);
          continue;
        } catch {
          this.redisAvailable = false;
        }
      }
      this.memoryLocks.delete(key);
    }
  }

  async getSeatLockHolder(routeId: string, seatNumber: number): Promise<SeatLockInfo | null> {
    const key = this.buildKey(routeId, seatNumber);
    if (this.redisClient && this.redisAvailable) {
      try {
        const holder = await this.redisClient.get(key);
        if (!holder) return null;
        const ttl = await this.redisClient.ttl(key);
        const expiresAt = new Date(Date.now() + Math.max(ttl, 0) * 1000).toISOString();
        return { sessionId: holder, expiresAt };
      } catch {
        this.redisAvailable = false;
      }
    }

    this.pruneExpiredMemoryLock(key);
    const entry = this.memoryLocks.get(key);
    if (!entry) return null;
    return {
      sessionId: entry.sessionId,
      expiresAt: new Date(entry.expiresAtMs).toISOString(),
    };
  }

  async verifyLockOwnership(
    routeId: string,
    seatNumbers: number[],
    sessionId: string,
  ): Promise<{ valid: boolean; conflictingSeat?: number }> {
    for (const seatNumber of seatNumbers) {
      const holder = await this.getSeatLockHolder(routeId, seatNumber);
      if (holder && holder.sessionId !== sessionId) {
        return { valid: false, conflictingSeat: seatNumber };
      }
    }
    return { valid: true };
  }

  isRedisConnected(): boolean {
    return this.redisAvailable;
  }
}
