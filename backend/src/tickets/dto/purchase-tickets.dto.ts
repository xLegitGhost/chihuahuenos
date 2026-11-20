import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class PurchaseTicketsDto {
  @ApiProperty({ example: 'uuid-route-id' })
  @IsString()
  @IsNotEmpty()
  routeId: string;

  @ApiProperty({ example: '[1,2]', description: 'JSON array or comma-separated seat numbers' })
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value.map(Number);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed.map(Number) : [];
        } catch {
          return [];
        }
      }
      return trimmed
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
    }
    return [];
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Debes seleccionar al menos un asiento para comprar' })
  @IsInt({ each: true })
  @Min(1, { each: true })
  seatNumbers: number[];

  @ApiProperty({ example: 'client-session-a' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ example: 'Uriel Ramírez' })
  @IsString()
  @MinLength(3, { message: 'Ingresa el nombre completo del pasajero' })
  passengerName: string;

  @ApiProperty({ example: 'uriel@chihuahuenos.com' })
  @IsEmail({}, { message: 'Ingresa un correo electrónico válido' })
  passengerEmail: string;

  @ApiProperty({ example: '6141234567' })
  @IsString()
  @MinLength(7, { message: 'Ingresa un teléfono de contacto válido' })
  passengerPhone: string;

  @ApiProperty({ enum: ['INE', 'PASAPORTE', 'LICENCIA'], default: 'INE' })
  @IsString()
  @IsIn(['INE', 'PASAPORTE', 'LICENCIA'], {
    message: 'Selecciona un tipo de documento oficial válido (INE, PASAPORTE o LICENCIA)',
  })
  documentType: 'INE' | 'PASAPORTE' | 'LICENCIA';
}
