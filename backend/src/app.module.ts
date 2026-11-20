import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PersistenceModule } from './persistence/persistence.module';
import { RedisModule } from './redis/redis.module';
import { RoutesModule } from './routes/routes.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    PersistenceModule,
    RoutesModule,
    TicketsModule,
  ],
})
export class AppModule {}
