import { Inject, Injectable } from '@nestjs/common';
import { PurchaseRecordInput, TicketingStoreService } from '../persistence/ticketing-store.service';
import { HoldSeatsDto } from './dto/hold-seats.dto';
import { ReleaseSeatsDto } from './dto/release-seats.dto';

@Injectable()
export class TicketsService {
  constructor(
    @Inject(TicketingStoreService) private readonly storeService: TicketingStoreService,
  ) {}

  holdSeats(dto: HoldSeatsDto) {
    return this.storeService.holdSeats(dto.routeId, dto.seatNumbers, dto.sessionId);
  }

  releaseSeats(dto: ReleaseSeatsDto) {
    return this.storeService.releaseSeats(dto.routeId, dto.seatNumbers, dto.sessionId);
  }

  purchaseTickets(input: PurchaseRecordInput) {
    return this.storeService.purchaseTickets(input);
  }

  getAllBookings() {
    return this.storeService.getAllBookings();
  }
}
