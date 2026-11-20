import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { TravelRoute } from './travel-route.entity';

export type SeatStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD';

@Entity('seats')
@Unique(['routeId', 'seatNumber'])
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  routeId: string;

  @ManyToOne(() => TravelRoute, (route) => route.seats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'routeId' })
  route?: Relation<TravelRoute>;

  @Column('int')
  seatNumber: number;

  @Column('text', { default: 'AVAILABLE' })
  status: SeatStatus;

  @Column('text', { nullable: true })
  reservedBySessionId: string | null;

  @Column('timestamptz', { nullable: true })
  reservedUntil: Date | null;

  @Column('uuid', { nullable: true })
  bookingId: string | null;

  @Column('text', { nullable: true })
  passengerName: string | null;
}
