import { Global, Module } from '@nestjs/common';
import { TicketingStoreService } from './ticketing-store.service';

@Global()
@Module({
  providers: [TicketingStoreService],
  exports: [TicketingStoreService],
})
export class PersistenceModule {}
