import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class HoldSeatsDto {
  @ApiProperty({ example: 'uuid-route-id' })
  @IsString()
  @IsNotEmpty()
  routeId: string;

  @ApiProperty({ example: [1, 2], type: [Number] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Debes seleccionar al menos un asiento' })
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  seatNumbers: number[];

  @ApiProperty({ example: 'client-session-a' })
  @IsString()
  @IsNotEmpty({ message: 'El identificador de sesión es obligatorio' })
  sessionId: string;
}
