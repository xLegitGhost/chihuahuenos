# Chihuahueños S.A. de C.V. — Sistema de Compra de Boletos Interestatales

Sistema fullstack de compra de boletos de autobús para viajes entre múltiples estados de la República Mexicana con control estricto de concurrencia en tiempo real y verificación documental de identidad.

## Arquitectura Técnica

- **Backend (`backend/`)**: API REST en **NestJS 12** con TypeORM + **PostgreSQL 16**, documentación OpenAPI/Swagger (`/api/docs`), subida de archivos con Multer y bloqueos atómicos distribuidos con **Redis 7** (script Lua `SET ... EX 600 NX` con fallback atómico en memoria para pruebas unitarias).
- **Frontend (`frontend/`)**: Aplicación **Next.js 14** (App Router, Tailwind CSS, validación accesible post-interacción y diálogos nativos `<dialog>`) con mapa interactivo de asientos 2x2, selector de sesiones concurrentes para pruebas en vivo, contador regresivo de apartado (10 min) y carga/vista previa de documento de identidad.
- **Orquestación (`docker-compose.yml`)**: Levanta `postgres`, `redis`, `backend` y `frontend` en un único comando.

## Requerimientos Implementados

1. **Rutas iniciales precargadas y escalabilidad futura**:
   - Oaxaca – Puebla
   - Chihuahua – Nuevo León
   - Baja California Norte – Baja California Sur
   - Chihuahua – CDMX
   - Creación dinámica de nuevas rutas mediante modal (`POST /api/routes`).
2. **Prevención de selección concurrente de boletos**:
   - Al seleccionar un asiento (`POST /api/tickets/hold`), Redis adquiere un lock atómico de 600 segundos por `(routeId, seatNumber, sessionId)` y sincroniza la reserva.
   - Si otro usuario intenta apartar o comprar el mismo asiento al mismo tiempo, la API responde `409 Conflict` y el frontend marca el asiento como bloqueado en ámbar en tiempo real.
   - El dueño de la reserva puede liberar su asiento (`POST /api/tickets/release`) o completar la compra transaccional (`POST /api/tickets/purchase`).
3. **Verificación de identidad mediante archivos (BONUS)**:
   - Carga obligatoria de identificación oficial (`INE`, `PASAPORTE`, `LICENCIA`) en formato imagen (`JPG`, `PNG`, `WEBP`) o `PDF` (máx. 5 MB) vía `multipart/form-data`.
   - Emisión de Pase de Abordar Digital con folio, estado `VERIFIED` y enlace directo al documento almacenado.

## Ejecución con Docker Compose

```bash
docker compose up --build
```

Servicios expuestos:
- **Frontend Next.js 14**: `http://localhost:3000`
- **Backend NestJS API**: `http://localhost:4000/api`
- **Swagger Docs**: `http://localhost:4000/api/docs`

## Pruebas y Compilación Local

```bash
# Backend tests (concurrencia, rutas iniciales y upload multipart)
pnpm --dir backend test

# Backend build
pnpm --dir backend build

# Frontend build
pnpm --dir frontend build
```
