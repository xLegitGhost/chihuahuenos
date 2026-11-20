import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Seat } from './seat.entity';

@Entity('travel_routes')
export class TravelRoute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  origin: string;

  @Column('text')
  destination: string;

  @Column('int')
  price: number;

  @Column('text')
  duration: string;

  @Column('text')
  departureTime: string;

  @Column('text')
  busNumber: string;

  @Column('int', { default: 24 })
  totalSeats: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Seat, (seat) => seat.route)
  seats?: Relation<Seat[]>;
}
