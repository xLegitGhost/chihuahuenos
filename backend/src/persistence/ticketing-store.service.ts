import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { RedisLockService } from '../redis/redis-lock.service';
import { CreateRouteDto } from '../routes/dto/create-route.dto';
import { Seat, SeatStatus } from '../routes/entities/seat.entity';
import { TravelRoute } from '../routes/entities/travel-route.entity';
import { TicketBooking } from '../tickets/entities/ticket-booking.entity';

export interface RouteSummaryView {
  id: string;
  origin: string;
  destination: string;
  price: number;
  duration: string;
  departureTime: string;
  busNumber: string;
  totalSeats: number;
  availableSeats: number;
  reservedSeats: number;
  soldSeats: number;
  createdAt: string;
}

export interface SeatView {
  id: string;
  seatNumber: number;
  status: SeatStatus;
  reservedBySessionId: string | null;
  reservedUntil: string | null;
  passengerName: string | null;
}

export interface RouteDetailView extends RouteSummaryView {
  seats: SeatView[];
}

export interface PurchaseRecordInput {
  routeId: string;
  seatNumbers: number[];
  sessionId: string;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  documentType: 'INE' | 'PASAPORTE' | 'LICENCIA';
  identityFileName: string;
  identityStoredName: string;
  identityMimeType: string;
  identityFileSize: number;
  identityDocumentUrl: string;
}

const INITIAL_ROUTES: Array<Omit<CreateRouteDto, 'totalSeats'> & { totalSeats: number }> = [
  {
    origin: 'Oaxaca',
    destination: 'Puebla',
    price: 480,
    duration: '4h 30m',
    departureTime: '08:00 AM',
    busNumber: 'CH-101',
    totalSeats: 24,
  },
  {
    origin: 'Chihuahua',
    destination: 'Nuevo León',
    price: 1150,
    duration: '9h 15m',
    departureTime: '10:30 AM',
    busNumber: 'CH-204',
    totalSeats: 24,
  },
  {
    origin: 'Baja California Norte',
    destination: 'Baja California Sur',
    price: 1380,
    duration: '11h 00m',
    departureTime: '07:00 AM',
    busNumber: 'CH-309',
    totalSeats: 24,
  },
  {
    origin: 'Chihuahua',
    destination: 'CDMX',
    price: 1850,
    duration: '16h 30m',
    departureTime: '06:00 PM',
    busNumber: 'CH-415',
    totalSeats: 24,
  },
];

@Injectable()
export class TicketingStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketingStoreService.name);
  private dataSource: DataSource | null = null;
  private pgReady = false;

  private memoryRoutes: TravelRoute[] = [];
  private memorySeats = new Map<string, Seat[]>();
  private memoryBookings: TicketBooking[] = [];

  constructor(
    @Inject(RedisLockService) private readonly redisLockService: RedisLockService,
    @Optional() @Inject(ConfigService) private readonly configService?: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const dbHost = this.configService?.get<string>('DB_HOST') ?? process.env.DB_HOST;
    const useInMemory =
      (this.configService?.get<string>('USE_IN_MEMORY_DB') ?? process.env.USE_IN_MEMORY_DB) === 'true' ||
      process.env.NODE_ENV === 'test';

    if (dbHost && !useInMemory) {
      const dbPort = Number(this.configService?.get<string>('DB_PORT') ?? process.env.DB_PORT ?? 5432);
      const dbUser = this.configService?.get<string>('DB_USER') ?? process.env.DB_USER ?? 'chihuahuenos';
      const dbPassword =
        this.configService?.get<string>('DB_PASSWORD') ?? process.env.DB_PASSWORD ?? 'chihuahuenos_secret';
      const dbName = this.configService?.get<string>('DB_NAME') ?? process.env.DB_NAME ?? 'chihuahuenos_db';

      try {
        this.dataSource = new DataSource({
          type: 'postgres',
          host: dbHost,
          port: dbPort,
          username: dbUser,
          password: dbPassword,
          database: dbName,
          entities: [TravelRoute, Seat, TicketBooking],
          synchronize: true,
          connectTimeoutMS: 4000,
        });
        await this.dataSource.initialize();
        this.pgReady = true;
        this.logger.log(`Connected to PostgreSQL at ${dbHost}:${dbPort}/${dbName}`);
      } catch (err) {
        this.logger.warn(`PostgreSQL unavailable (${(err as Error).message}); using in-memory persistence store.`);
        this.pgReady = false;
        this.dataSource = null;
      }
    } else {
      this.logger.log('Using in-memory persistence store.');
    }

    await this.seedInitialRoutes();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy().catch(() => undefined);
    }
  }

  private async seedInitialRoutes(): Promise<void> {
    const existing = await this.listRawRoutes();
    if (existing.length > 0) return;

    for (const seed of INITIAL_ROUTES) {
      await this.createRoute(seed);
    }
    this.logger.log(`Seeded ${INITIAL_ROUTES.length} initial Chihuahueños routes.`);
  }

  private async listRawRoutes(): Promise<TravelRoute[]> {
    if (this.pgReady && this.dataSource) {
      return this.dataSource.getRepository(TravelRoute).find({ order: { createdAt: 'ASC' } });
    }
    return [...this.memoryRoutes];
  }

  private async getRawRouteWithSeats(routeId: string): Promise<{ route: TravelRoute; seats: Seat[] }> {
    if (this.pgReady && this.dataSource) {
      const route = await this.dataSource.getRepository(TravelRoute).findOne({ where: { id: routeId } });
      if (!route) throw new NotFoundException(`Ruta ${routeId} no encontrada`);
      const seats = await this.dataSource
        .getRepository(Seat)
        .find({ where: { routeId }, order: { seatNumber: 'ASC' } });
      return { route, seats };
    }

    const route = this.memoryRoutes.find((r) => r.id === routeId);
    if (!route) throw new NotFoundException(`Ruta ${routeId} no encontrada`);
    const seats = [...(this.memorySeats.get(routeId) ?? [])].sort((a, b) => a.seatNumber - b.seatNumber);
    return { route, seats };
  }

  private async buildSeatViews(routeId: string, seats: Seat[]): Promise<SeatView[]> {
    const nowMs = Date.now();
    const views: SeatView[] = [];

    for (const seat of seats) {
      if (seat.status === 'SOLD') {
        views.push({
          id: seat.id,
          seatNumber: seat.seatNumber,
          status: 'SOLD',
          reservedBySessionId: null,
          reservedUntil: null,
          passengerName: seat.passengerName,
        });
        continue;
      }

      const redisHolder = await this.redisLockService.getSeatLockHolder(routeId, seat.seatNumber);
      if (redisHolder) {
        views.push({
          id: seat.id,
          seatNumber: seat.seatNumber,
          status: 'RESERVED',
          reservedBySessionId: redisHolder.sessionId,
          reservedUntil: redisHolder.expiresAt,
          passengerName: null,
        });
        continue;
      }

      if (
        seat.status === 'RESERVED' &&
        seat.reservedUntil &&
        new Date(seat.reservedUntil).getTime() > nowMs &&
        seat.reservedBySessionId
      ) {
        views.push({
          id: seat.id,
          seatNumber: seat.seatNumber,
          status: 'RESERVED',
          reservedBySessionId: seat.reservedBySessionId,
          reservedUntil: new Date(seat.reservedUntil).toISOString(),
          passengerName: null,
        });
        continue;
      }

      views.push({
        id: seat.id,
        seatNumber: seat.seatNumber,
        status: 'AVAILABLE',
        reservedBySessionId: null,
        reservedUntil: null,
        passengerName: null,
      });
    }

    return views;
  }

  private summarizeRoute(route: TravelRoute, seatViews: SeatView[]): RouteSummaryView {
    let availableSeats = 0;
    let reservedSeats = 0;
    let soldSeats = 0;

    for (const seat of seatViews) {
      if (seat.status === 'SOLD') soldSeats += 1;
      else if (seat.status === 'RESERVED') reservedSeats += 1;
      else availableSeats += 1;
    }

    return {
      id: route.id,
      origin: route.origin,
      destination: route.destination,
      price: route.price,
      duration: route.duration,
      departureTime: route.departureTime,
      busNumber: route.busNumber,
      totalSeats: route.totalSeats,
      availableSeats,
      reservedSeats,
      soldSeats,
      createdAt: route.createdAt instanceof Date ? route.createdAt.toISOString() : new Date(route.createdAt).toISOString(),
    };
  }

  async getAllRoutes(): Promise<RouteSummaryView[]> {
    const routes = await this.listRawRoutes();
    const summaries: RouteSummaryView[] = [];

    for (const route of routes) {
      const { seats } = await this.getRawRouteWithSeats(route.id);
      const seatViews = await this.buildSeatViews(route.id, seats);
      summaries.push(this.summarizeRoute(route, seatViews));
    }

    return summaries;
  }

  async getRouteDetail(routeId: string): Promise<RouteDetailView> {
    const { route, seats } = await this.getRawRouteWithSeats(routeId);
    const seatViews = await this.buildSeatViews(route.id, seats);
    return {
      ...this.summarizeRoute(route, seatViews),
      seats: seatViews,
    };
  }

  async createRoute(dto: CreateRouteDto): Promise<RouteDetailView> {
    const totalSeats = dto.totalSeats ?? 24;
    const busNumber = dto.busNumber?.trim() || `CH-${Math.floor(500 + Math.random() * 499)}`;

    if (this.pgReady && this.dataSource) {
      const savedRoute = await this.dataSource.transaction(async (manager) => {
        const routeRepo = manager.getRepository(TravelRoute);
        const seatRepo = manager.getRepository(Seat);

        const route = routeRepo.create({
          origin: dto.origin.trim(),
          destination: dto.destination.trim(),
          price: Number(dto.price),
          duration: dto.duration.trim(),
          departureTime: dto.departureTime.trim(),
          busNumber,
          totalSeats,
        });
        const persisted = await routeRepo.save(route);

        const seatEntities: Seat[] = [];
        for (let i = 1; i <= totalSeats; i += 1) {
          seatEntities.push(
            seatRepo.create({
              routeId: persisted.id,
              seatNumber: i,
              status: 'AVAILABLE',
              reservedBySessionId: null,
              reservedUntil: null,
              bookingId: null,
              passengerName: null,
            }),
          );
        }
        await seatRepo.save(seatEntities);
        return persisted;
      });

      return this.getRouteDetail(savedRoute.id);
    }

    const routeId = randomUUID();
    const route: TravelRoute = {
      id: routeId,
      origin: dto.origin.trim(),
      destination: dto.destination.trim(),
      price: Number(dto.price),
      duration: dto.duration.trim(),
      departureTime: dto.departureTime.trim(),
      busNumber,
      totalSeats,
      createdAt: new Date(),
    };
    const seats: Seat[] = [];
    for (let i = 1; i <= totalSeats; i += 1) {
      seats.push({
        id: randomUUID(),
        routeId,
        seatNumber: i,
        status: 'AVAILABLE',
        reservedBySessionId: null,
        reservedUntil: null,
        bookingId: null,
        passengerName: null,
      });
    }
    this.memoryRoutes.push(route);
    this.memorySeats.set(routeId, seats);
    return this.getRouteDetail(routeId);
  }

  async holdSeats(routeId: string, seatNumbers: number[], sessionId: string) {
    const uniqueSeats = [...new Set(seatNumbers)];
    if (uniqueSeats.length === 0) {
      throw new BadRequestException('Debes seleccionar al menos un asiento');
    }

    const { route, seats } = await this.getRawRouteWithSeats(routeId);
    for (const num of uniqueSeats) {
      const target = seats.find((s) => s.seatNumber === num);
      if (!target) {
        throw new BadRequestException(`El asiento #${num} no existe en la ruta ${route.origin} - ${route.destination}`);
      }
      if (target.status === 'SOLD') {
        throw new ConflictException(`El asiento #${num} ya fue vendido y no está disponible.`);
      }
    }

    const lockResult = await this.redisLockService.acquireSeatsLock(routeId, uniqueSeats, sessionId, 600);
    if (!lockResult.success) {
      throw new ConflictException(
        `El asiento #${lockResult.conflictingSeat} ya está seleccionado por otro usuario en este momento.`,
      );
    }

    const reservedUntil = new Date(lockResult.expiresAt);

    if (this.pgReady && this.dataSource) {
      try {
        await this.dataSource.transaction(async (manager) => {
          const seatRepo = manager.getRepository(Seat);
          const dbSeats = await seatRepo.find({
            where: { routeId, seatNumber: In(uniqueSeats) },
            lock: { mode: 'pessimistic_write' },
          });

          const now = new Date();
          for (const dbSeat of dbSeats) {
            if (dbSeat.status === 'SOLD') {
              throw new ConflictException(`El asiento #${dbSeat.seatNumber} ya fue vendido.`);
            }
            if (
              dbSeat.status === 'RESERVED' &&
              dbSeat.reservedBySessionId &&
              dbSeat.reservedBySessionId !== sessionId &&
              dbSeat.reservedUntil &&
              dbSeat.reservedUntil > now
            ) {
              throw new ConflictException(
                `El asiento #${dbSeat.seatNumber} ya está seleccionado por otro usuario en este momento.`,
              );
            }
            dbSeat.status = 'RESERVED';
            dbSeat.reservedBySessionId = sessionId;
            dbSeat.reservedUntil = reservedUntil;
          }
          await seatRepo.save(dbSeats);
        });
      } catch (err) {
        await this.redisLockService.releaseSeatsLock(routeId, uniqueSeats, sessionId);
        throw err;
      }
    } else {
      const memSeats = this.memorySeats.get(routeId) ?? [];
      const nowMs = Date.now();
      for (const num of uniqueSeats) {
        const seat = memSeats.find((s) => s.seatNumber === num);
        if (!seat) continue;
        if (seat.status === 'SOLD') {
          await this.redisLockService.releaseSeatsLock(routeId, uniqueSeats, sessionId);
          throw new ConflictException(`El asiento #${num} ya fue vendido.`);
        }
        if (
          seat.status === 'RESERVED' &&
          seat.reservedBySessionId &&
          seat.reservedBySessionId !== sessionId &&
          seat.reservedUntil &&
          seat.reservedUntil.getTime() > nowMs
        ) {
          await this.redisLockService.releaseSeatsLock(routeId, uniqueSeats, sessionId);
          throw new ConflictException(
            `El asiento #${num} ya está seleccionado por otro usuario en este momento.`,
          );
        }
        seat.status = 'RESERVED';
        seat.reservedBySessionId = sessionId;
        seat.reservedUntil = reservedUntil;
      }
    }

    return {
      message: 'Asientos apartados temporalmente por 10 minutos',
      routeId,
      seatNumbers: uniqueSeats,
      sessionId,
      reservedUntil: lockResult.expiresAt,
    };
  }

  async releaseSeats(routeId: string, seatNumbers: number[], sessionId: string) {
    const uniqueSeats = [...new Set(seatNumbers)];
    await this.getRawRouteWithSeats(routeId);

    const ownership = await this.redisLockService.verifyLockOwnership(routeId, uniqueSeats, sessionId);
    if (!ownership.valid) {
      throw new ConflictException(
        `No puedes liberar el asiento #${ownership.conflictingSeat} porque pertenece a otro usuario.`,
      );
    }

    await this.redisLockService.releaseSeatsLock(routeId, uniqueSeats, sessionId);

    if (this.pgReady && this.dataSource) {
      await this.dataSource
        .getRepository(Seat)
        .createQueryBuilder()
        .update(Seat)
        .set({ status: 'AVAILABLE', reservedBySessionId: null, reservedUntil: null })
        .where('routeId = :routeId', { routeId })
        .andWhere('seatNumber IN (:...seatNumbers)', { seatNumbers: uniqueSeats })
        .andWhere('status != :sold', { sold: 'SOLD' })
        .andWhere('(reservedBySessionId = :sessionId OR reservedBySessionId IS NULL)', { sessionId })
        .execute();
    } else {
      const memSeats = this.memorySeats.get(routeId) ?? [];
      for (const num of uniqueSeats) {
        const seat = memSeats.find((s) => s.seatNumber === num);
        if (seat && seat.status !== 'SOLD' && (!seat.reservedBySessionId || seat.reservedBySessionId === sessionId)) {
          seat.status = 'AVAILABLE';
          seat.reservedBySessionId = null;
          seat.reservedUntil = null;
        }
      }
    }

    return {
      message: 'Asientos liberados correctamente',
      routeId,
      seatNumbers: uniqueSeats,
    };
  }

  async purchaseTickets(input: PurchaseRecordInput): Promise<TicketBooking> {
    const uniqueSeats = [...new Set(input.seatNumbers)].sort((a, b) => a - b);
    if (uniqueSeats.length === 0) {
      throw new BadRequestException('Debes seleccionar al menos un asiento para comprar');
    }

    const { route, seats } = await this.getRawRouteWithSeats(input.routeId);
    for (const num of uniqueSeats) {
      const target = seats.find((s) => s.seatNumber === num);
      if (!target) {
        throw new BadRequestException(`El asiento #${num} no existe en esta ruta`);
      }
      if (target.status === 'SOLD') {
        throw new ConflictException(`El asiento #${num} ya fue vendido anteriormente.`);
      }
    }

    // Attempt atomic lock acquisition or ownership confirmation before committing sale
    const lockResult = await this.redisLockService.acquireSeatsLock(
      input.routeId,
      uniqueSeats,
      input.sessionId,
      120,
    );
    if (!lockResult.success) {
      throw new ConflictException(
        `El asiento #${lockResult.conflictingSeat} está bloqueado por otro usuario y no puede comprarse.`,
      );
    }

    const bookingCode = `CHIH-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const routeLabel = `${route.origin} – ${route.destination}`;
    const totalAmount = route.price * uniqueSeats.length;

    let savedBooking: TicketBooking;

    if (this.pgReady && this.dataSource) {
      try {
        savedBooking = await this.dataSource.transaction(async (manager) => {
          const seatRepo = manager.getRepository(Seat);
          const bookingRepo = manager.getRepository(TicketBooking);

          const dbSeats = await seatRepo.find({
            where: { routeId: input.routeId, seatNumber: In(uniqueSeats) },
            lock: { mode: 'pessimistic_write' },
          });

          const now = new Date();
          for (const dbSeat of dbSeats) {
            if (dbSeat.status === 'SOLD') {
              throw new ConflictException(`El asiento #${dbSeat.seatNumber} ya fue vendido.`);
            }
            if (
              dbSeat.status === 'RESERVED' &&
              dbSeat.reservedBySessionId &&
              dbSeat.reservedBySessionId !== input.sessionId &&
              dbSeat.reservedUntil &&
              dbSeat.reservedUntil > now
            ) {
              throw new ConflictException(
                `El asiento #${dbSeat.seatNumber} pertenece a la reserva activa de otro cliente.`,
              );
            }
          }

          const booking = bookingRepo.create({
            bookingCode,
            routeId: input.routeId,
            routeLabel,
            seatNumbers: uniqueSeats,
            totalAmount,
            passengerName: input.passengerName.trim(),
            passengerEmail: input.passengerEmail.trim(),
            passengerPhone: input.passengerPhone.trim(),
            documentType: input.documentType,
            identityFileName: input.identityFileName,
            identityStoredName: input.identityStoredName,
            identityMimeType: input.identityMimeType,
            identityFileSize: input.identityFileSize,
            identityVerificationStatus: 'VERIFIED',
            identityDocumentUrl: input.identityDocumentUrl,
            sessionId: input.sessionId,
          });
          const persistedBooking = await bookingRepo.save(booking);

          for (const dbSeat of dbSeats) {
            dbSeat.status = 'SOLD';
            dbSeat.reservedBySessionId = null;
            dbSeat.reservedUntil = null;
            dbSeat.bookingId = persistedBooking.id;
            dbSeat.passengerName = input.passengerName.trim();
          }
          await seatRepo.save(dbSeats);

          return persistedBooking;
        });
      } catch (err) {
        await this.redisLockService.releaseSeatsLock(input.routeId, uniqueSeats, input.sessionId);
        throw err;
      }
    } else {
      const memSeats = this.memorySeats.get(input.routeId) ?? [];
      const nowMs = Date.now();
      for (const num of uniqueSeats) {
        const seat = memSeats.find((s) => s.seatNumber === num);
        if (!seat) continue;
        if (seat.status === 'SOLD') {
          await this.redisLockService.releaseSeatsLock(input.routeId, uniqueSeats, input.sessionId);
          throw new ConflictException(`El asiento #${num} ya fue vendido.`);
        }
        if (
          seat.status === 'RESERVED' &&
          seat.reservedBySessionId &&
          seat.reservedBySessionId !== input.sessionId &&
          seat.reservedUntil &&
          seat.reservedUntil.getTime() > nowMs
        ) {
          await this.redisLockService.releaseSeatsLock(input.routeId, uniqueSeats, input.sessionId);
          throw new ConflictException(
            `El asiento #${num} pertenece a la reserva activa de otro cliente.`,
          );
        }
      }

      const bookingId = randomUUID();
      savedBooking = {
        id: bookingId,
        bookingCode,
        routeId: input.routeId,
        routeLabel,
        seatNumbers: uniqueSeats,
        totalAmount,
        passengerName: input.passengerName.trim(),
        passengerEmail: input.passengerEmail.trim(),
        passengerPhone: input.passengerPhone.trim(),
        documentType: input.documentType,
        identityFileName: input.identityFileName,
        identityStoredName: input.identityStoredName,
        identityMimeType: input.identityMimeType,
        identityFileSize: input.identityFileSize,
        identityVerificationStatus: 'VERIFIED',
        identityDocumentUrl: input.identityDocumentUrl,
        sessionId: input.sessionId,
        createdAt: new Date(),
      };

      for (const num of uniqueSeats) {
        const seat = memSeats.find((s) => s.seatNumber === num);
        if (seat) {
          seat.status = 'SOLD';
          seat.reservedBySessionId = null;
          seat.reservedUntil = null;
          seat.bookingId = bookingId;
          seat.passengerName = input.passengerName.trim();
        }
      }
      this.memoryBookings.unshift(savedBooking);
    }

    await this.redisLockService.forceClearSeatsLock(input.routeId, uniqueSeats);
    return savedBooking;
  }

  async getAllBookings(): Promise<TicketBooking[]> {
    if (this.pgReady && this.dataSource) {
      return this.dataSource.getRepository(TicketBooking).find({ order: { createdAt: 'DESC' } });
    }
    return [...this.memoryBookings];
  }
}
