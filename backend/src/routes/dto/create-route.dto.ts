import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRouteDto {
  @ApiProperty({ example: 'Guadalajara' })
  @IsString()
  @IsNotEmpty({ message: 'El estado de origen es obligatorio' })
  origin: string;

  @ApiProperty({ example: 'Monterrey' })
  @IsString()
  @IsNotEmpty({ message: 'El estado de destino es obligatorio' })
  destination: string;

  @ApiProperty({ example: 1290 })
  @Type(() => Number)
  @IsNumber()
  @Min(100, { message: 'El precio mínimo es $100 MXN' })
  price: number;

  @ApiProperty({ example: '9h 45m' })
  @IsString()
  @IsNotEmpty({ message: 'La duración estimada es obligatoria' })
  duration: string;

  @ApiProperty({ example: '09:15 AM' })
  @IsString()
  @IsNotEmpty({ message: 'La hora de salida es obligatoria' })
  departureTime: string;

  @ApiPropertyOptional({ example: 'CH-508' })
  @IsOptional()
  @IsString()
  busNumber?: string;

  @ApiPropertyOptional({ example: 24, default: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(8)
  @Max(48)
  totalSeats?: number;
}
