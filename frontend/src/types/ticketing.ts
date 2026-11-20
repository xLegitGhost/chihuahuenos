export type SeatStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD';

export interface SeatView {
  id: string;
  seatNumber: number;
  status: SeatStatus;
  reservedBySessionId: string | null;
  reservedUntil: string | null;
  passengerName: string | null;
}

export interface RouteSummary {
  id: string;
  origin: string;
  destination: string;
  price: number;
  duration: string;
  departureTime: string;
  busNumber: string;
  totalSeats: number;
  availableSeats: number;
  reservedSeats: number;
  soldSeats: number;
  createdAt: string;
}

export interface RouteDetail extends RouteSummary {
  seats: SeatView[];
}

export interface TicketBooking {
  id: string;
  bookingCode: string;
  routeId: string;
  routeLabel: string;
  seatNumbers: number[];
  totalAmount: number;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  documentType: 'INE' | 'PASAPORTE' | 'LICENCIA';
  identityFileName: string;
  identityStoredName: string;
  identityMimeType: string;
  identityFileSize: number;
  identityVerificationStatus: 'VERIFIED' | 'PENDING';
  identityDocumentUrl: string;
  sessionId: string;
  createdAt: string;
}
