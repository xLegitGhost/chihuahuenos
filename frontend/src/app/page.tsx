import TicketingDashboard from './_components/ticketing-dashboard';
import type { RouteDetail, RouteSummary, TicketBooking } from '@/types/ticketing';

export const dynamic = 'force-dynamic';

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

async function loadInitialData(): Promise<{
  routes: RouteSummary[];
  initialRouteDetail: RouteDetail | null;
  bookings: TicketBooking[];
}> {
  try {
    const [routesRes, bookingsRes] = await Promise.all([
      fetch(`${INTERNAL_API_URL}/routes`, { cache: 'no-store' }),
      fetch(`${INTERNAL_API_URL}/tickets/bookings`, { cache: 'no-store' }),
    ]);

    const routes: RouteSummary[] = routesRes.ok ? await routesRes.json() : [];
    const bookings: TicketBooking[] = bookingsRes.ok ? await bookingsRes.json() : [];

    let initialRouteDetail: RouteDetail | null = null;
    if (routes.length > 0) {
      const detailRes = await fetch(`${INTERNAL_API_URL}/routes/${routes[0].id}`, {
        cache: 'no-store',
      });
      if (detailRes.ok) {
        initialRouteDetail = await detailRes.json();
      }
    }

    return { routes, initialRouteDetail, bookings };
  } catch {
    return { routes: [], initialRouteDetail: null, bookings: [] };
  }
}

export default async function HomePage() {
  const { routes, initialRouteDetail, bookings } = await loadInitialData();

  return (
    <TicketingDashboard
      initialRoutes={routes}
      initialRouteDetail={initialRouteDetail}
      initialBookings={bookings}
    />
  );
}
