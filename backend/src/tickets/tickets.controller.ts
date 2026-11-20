import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { HoldSeatsDto } from './dto/hold-seats.dto';
import { PurchaseTicketsDto } from './dto/purchase-tickets.dto';
import { ReleaseSeatsDto } from './dto/release-seats.dto';
import { TicketsService } from './tickets.service';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'identities');

function ensureUploadsDir(): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  return UPLOADS_DIR;
}

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

@ApiTags('Tickets')
@Controller('tickets')
export class TicketsController {
  constructor(@Inject(TicketsService) private readonly ticketsService: TicketsService) {}

  @Post('hold')
  @ApiOperation({ summary: 'Atomically lock selected seats for a user session (10 min TTL)' })
  holdSeats(@Body() holdSeatsDto: HoldSeatsDto) {
    return this.ticketsService.holdSeats(holdSeatsDto);
  }

  @Post('release')
  @ApiOperation({ summary: 'Release temporarily locked seats owned by the user session' })
  releaseSeats(@Body() releaseSeatsDto: ReleaseSeatsDto) {
    return this.ticketsService.releaseSeats(releaseSeatsDto);
  }

  @Post('purchase')
  @ApiOperation({ summary: 'Confirm ticket purchase and upload identity verification file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        routeId: { type: 'string' },
        seatNumbers: { type: 'string', example: '[1,2]' },
        sessionId: { type: 'string' },
        passengerName: { type: 'string' },
        passengerEmail: { type: 'string' },
        passengerPhone: { type: 'string' },
        documentType: { type: 'string', enum: ['INE', 'PASAPORTE', 'LICENCIA'] },
        identityFile: { type: 'string', format: 'binary' },
      },
      required: [
        'routeId',
        'seatNumbers',
        'sessionId',
        'passengerName',
        'passengerEmail',
        'passengerPhone',
        'documentType',
        'identityFile',
      ],
    },
  })
  @UseInterceptors(
    FileInterceptor('identityFile', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, ensureUploadsDir());
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase() || '.bin';
          cb(null, `${Date.now()}-${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const validMime =
          file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
        if (validMime && (!ext || ALLOWED_EXTENSIONS.has(ext))) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Formato de documento no válido. Sube una imagen (JPG, PNG, WEBP) o PDF.',
            ),
            false,
          );
        }
      },
    }),
  )
  purchaseTickets(
    @Body() dto: PurchaseTicketsDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        'El documento de verificación de identidad es obligatorio para completar la compra.',
      );
    }

    const seatNumbers = Array.isArray(dto.seatNumbers) ? dto.seatNumbers : [];

    return this.ticketsService.purchaseTickets({
      routeId: dto.routeId,
      seatNumbers,
      sessionId: dto.sessionId,
      passengerName: dto.passengerName,
      passengerEmail: dto.passengerEmail,
      passengerPhone: dto.passengerPhone,
      documentType: dto.documentType,
      identityFileName: file.originalname,
      identityStoredName: file.filename,
      identityMimeType: file.mimetype,
      identityFileSize: file.size,
      identityDocumentUrl: `/api/tickets/identity-file/${file.filename}`,
    });
  }

  @Get('bookings')
  @ApiOperation({ summary: 'List all confirmed bookings with identity verification status' })
  getBookings() {
    return this.ticketsService.getAllBookings();
  }

  @Get('identity-file/:filename')
  @ApiOperation({ summary: 'Retrieve an uploaded identity verification document' })
  getIdentityFile(@Param('filename') filename: string, @Res() res: Response) {
    const safeName = path.basename(filename);
    const fullPath = path.join(ensureUploadsDir(), safeName);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('Documento de identidad no encontrado');
    }
    return res.sendFile(fullPath);
  }
}
