import { Inject, Injectable } from '@nestjs/common';
import { TicketingStoreService } from '../persistence/ticketing-store.service';
import { CreateRouteDto } from './dto/create-route.dto';

@Injectable()
export class RoutesService {
  constructor(
    @Inject(TicketingStoreService) private readonly storeService: TicketingStoreService,
  ) {}

  findAll() {
    return this.storeService.getAllRoutes();
  }

  findOne(id: string) {
    return this.storeService.getRouteDetail(id);
  }

  create(createRouteDto: CreateRouteDto) {
    return this.storeService.createRoute(createRouteDto);
  }
}
