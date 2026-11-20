import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('ticket_bookings')
export class TicketBooking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  bookingCode: string;

  @Column('uuid')
  routeId: string;

  @Column('text')
  routeLabel: string;

  @Column('simple-json')
  seatNumbers: number[];

  @Column('int')
  totalAmount: number;

  @Column('text')
  passengerName: string;

  @Column('text')
  passengerEmail: string;

  @Column('text')
  passengerPhone: string;

  @Column('text')
  documentType: 'INE' | 'PASAPORTE' | 'LICENCIA';

  @Column('text')
  identityFileName: string;

  @Column('text')
  identityStoredName: string;

  @Column('text')
  identityMimeType: string;

  @Column('int')
  identityFileSize: number;

  @Column('text', { default: 'VERIFIED' })
  identityVerificationStatus: 'VERIFIED' | 'PENDING';

  @Column('text')
  identityDocumentUrl: string;

  @Column('text')
  sessionId: string;

  @CreateDateColumn()
  createdAt: Date;
}
