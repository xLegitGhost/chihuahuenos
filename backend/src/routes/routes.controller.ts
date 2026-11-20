import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateRouteDto } from './dto/create-route.dto';
import { RoutesService } from './routes.service';

@ApiTags('Routes')
@Controller('routes')
export class RoutesController {
  constructor(@Inject(RoutesService) private readonly routesService: RoutesService) {}

  @Get()
  @ApiOperation({ summary: 'List all available inter-state routes with seat availability summary' })
  findAll() {
    return this.routesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get route details and real-time seat status map' })
  findOne(@Param('id') id: string) {
    return this.routesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new inter-state route with seats' })
  create(@Body() createRouteDto: CreateRouteDto) {
    return this.routesService.create(createRouteDto);
  }
}
