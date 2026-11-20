import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('Chihuahueños Ticketing API (Concurrency, Routes & Identity Upload)', () => {
  let app: INestApplication;
  const createdFiles: string[] = [];

  beforeAll(async () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    for (const storedName of createdFiles) {
      const target = path.resolve(process.cwd(), 'uploads', 'identities', storedName);
      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }
  });

  it('seeds the 4 required inter-state routes on startup', async () => {
    const res = await request(app.getHttpServer()).get('/api/routes').expect(200);
    const routeNames = res.body.map((r: { origin: string; destination: string }) => `${r.origin} - ${r.destination}`);

    expect(res.body.length).toBeGreaterThanOrEqual(4);
    expect(routeNames).toContain('Oaxaca - Puebla');
    expect(routeNames).toContain('Chihuahua - Nuevo León');
    expect(routeNames).toContain('Baja California Norte - Baja California Sur');
    expect(routeNames).toContain('Chihuahua - CDMX');
  });

  it('allows creating new routes dynamically for future expansion', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/routes')
      .send({
        origin: 'Guadalajara',
        destination: 'Monterrey',
        price: 1250,
        duration: '10h 00m',
        departureTime: '09:30 AM',
        busNumber: 'CH-777',
        totalSeats: 20,
      })
      .expect(201);

    expect(res.body.origin).toBe('Guadalajara');
    expect(res.body.destination).toBe('Monterrey');
    expect(res.body.totalSeats).toBe(20);
    expect(res.body.seats).toHaveLength(20);
  });

  it('prevents concurrent seat selection by two users at the exact same time', async () => {
    const routesRes = await request(app.getHttpServer()).get('/api/routes').expect(200);
    const routeId = routesRes.body[0].id;

    const [resUserA, resUserB] = await Promise.all([
      request(app.getHttpServer()).post('/api/tickets/hold').send({
        routeId,
        seatNumbers: [7],
        sessionId: 'session-user-A',
      }),
      request(app.getHttpServer()).post('/api/tickets/hold').send({
        routeId,
        seatNumbers: [7],
        sessionId: 'session-user-B',
      }),
    ]);

    const statuses = [resUserA.status, resUserB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const winnerSession = resUserA.status === 201 ? 'session-user-A' : 'session-user-B';
    const loserSession = resUserA.status === 201 ? 'session-user-B' : 'session-user-A';

    // Loser cannot purchase the held seat either
    await request(app.getHttpServer())
      .post('/api/tickets/purchase')
      .field('routeId', routeId)
      .field('seatNumbers', JSON.stringify([7]))
      .field('sessionId', loserSession)
      .field('passengerName', 'Usuario Concurrente')
      .field('passengerEmail', 'concurrente@example.com')
      .field('passengerPhone', '6141112233')
      .field('documentType', 'INE')
      .attach('identityFile', Buffer.from('fake-image-bytes'), 'ine-loser.png')
      .expect(409);

    // Winner can purchase ONLY when attaching an identity document (BONUS)
    await request(app.getHttpServer())
      .post('/api/tickets/purchase')
      .field('routeId', routeId)
      .field('seatNumbers', JSON.stringify([7]))
      .field('sessionId', winnerSession)
      .field('passengerName', 'Uriel Ramírez')
      .field('passengerEmail', 'uriel@chihuahuenos.com')
      .field('passengerPhone', '6149876543')
      .field('documentType', 'INE')
      .expect(400);

    const purchaseRes = await request(app.getHttpServer())
      .post('/api/tickets/purchase')
      .field('routeId', routeId)
      .field('seatNumbers', JSON.stringify([7]))
      .field('sessionId', winnerSession)
      .field('passengerName', 'Uriel Ramírez')
      .field('passengerEmail', 'uriel@chihuahuenos.com')
      .field('passengerPhone', '6149876543')
      .field('documentType', 'INE')
      .attach('identityFile', Buffer.from('fake-ine-photo-data'), 'ine-winner.png')
      .expect(201);

    createdFiles.push(purchaseRes.body.identityStoredName);

    expect(purchaseRes.body.identityVerificationStatus).toBe('VERIFIED');
    expect(purchaseRes.body.seatNumbers).toEqual([7]);
    expect(purchaseRes.body.bookingCode).toMatch(/^CHIH-\d{4}-/);

    // Verify seat #7 is permanently marked SOLD in route detail
    const detailRes = await request(app.getHttpServer()).get(`/api/routes/${routeId}`).expect(200);
    const seat7 = detailRes.body.seats.find((s: { seatNumber: number }) => s.seatNumber === 7);
    expect(seat7.status).toBe('SOLD');
  });
});
