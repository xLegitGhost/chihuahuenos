'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LuArmchair,
  LuBan,
  LuBus,
  LuCircleCheck,
  LuClock,
  LuFileCheck,
  LuLock,
  LuRefreshCw,
  LuShieldCheck,
  LuTicket,
  LuTriangleAlert,
  LuUpload,
  LuUsers,
} from 'react-icons/lu';
import type { RouteDetail, RouteSummary, SeatView, TicketBooking } from '@/types/ticketing';
import { attachFormValidation } from '@/utils/form-validation';
import BoardingPassDialog from './boarding-pass-dialog';
import CreateRouteDialog from './create-route-dialog';

interface TicketingDashboardProps {
  initialRoutes: RouteSummary[];
  initialRouteDetail: RouteDetail | null;
  initialBookings: TicketBooking[];
}

const SESSION_PROFILES = [
  { id: 'client-session-alpha', label: 'Cliente A (Tú)' },
  { id: 'client-session-beta', label: 'Cliente B (Concurrente)' },
  { id: 'client-session-gamma', label: 'Cliente C (Concurrente)' },
];

export default function TicketingDashboard({
  initialRoutes,
  initialRouteDetail,
  initialBookings,
}: TicketingDashboardProps) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  const apiBaseRoot = apiUrl.replace(/\/api\/?$/, '');

  const [routes, setRoutes] = useState<RouteSummary[]>(initialRoutes);
  const [selectedRouteId, setSelectedRouteId] = useState<string>(initialRoutes[0]?.id ?? '');
  const [routeDetail, setRouteDetail] = useState<RouteDetail | null>(initialRouteDetail);
  const [bookings, setBookings] = useState<TicketBooking[]>(initialBookings);

  const [activeSessionId, setActiveSessionId] = useState<string>(SESSION_PROFILES[0].id);
  const [pendingSeat, setPendingSeat] = useState<number | null>(null);
  const [concurrencyNotice, setConcurrencyNotice] = useState<{
    type: 'error' | 'info' | 'success';
    text: string;
  } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Checkout & Identity form state
  const checkoutFormRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [passengerName, setPassengerName] = useState('');
  const [passengerEmail, setPassengerEmail] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [documentType, setDocumentType] = useState<'INE' | 'PASAPORTE' | 'LICENCIA'>('INE');
  const [identityFile, setIdentityFile] = useState<File | null>(null);
  const [identityPreviewUrl, setIdentityPreviewUrl] = useState<string | null>(null);
  const [submittingPurchase, setSubmittingPurchase] = useState(false);

  const [activeBoardingPass, setActiveBoardingPass] = useState<TicketBooking | null>(null);

  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const form = checkoutFormRef.current;
    if (!form) return;
    return attachFormValidation(form);
  }, []);

  // Tick every second to show live countdown for temporary holds
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Clean up local object URL when preview file changes
  useEffect(() => {
    return () => {
      if (identityPreviewUrl) {
        URL.revokeObjectURL(identityPreviewUrl);
      }
    };
  }, [identityPreviewUrl]);

  const refreshState = useCallback(
    async (targetRouteId?: string) => {
      const routeId = targetRouteId || selectedRouteId;
      try {
        const [routesRes, bookingsRes] = await Promise.all([
          fetch(`${apiUrl}/routes`, { cache: 'no-store' }),
          fetch(`${apiUrl}/tickets/bookings`, { cache: 'no-store' }),
        ]);

        if (routesRes.ok) {
          const updatedRoutes: RouteSummary[] = await routesRes.json();
          setRoutes(updatedRoutes);
          const effectiveId = routeId || updatedRoutes[0]?.id;
          if (effectiveId) {
            if (!routeId) setSelectedRouteId(effectiveId);
            const detailRes = await fetch(`${apiUrl}/routes/${effectiveId}`, { cache: 'no-store' });
            if (detailRes.ok) {
              setRouteDetail(await detailRes.json());
            }
          }
        }
        if (bookingsRes.ok) {
          setBookings(await bookingsRes.json());
        }
      } catch {
        // Keep current view during transient network polling hiccups
      }
    },
    [apiUrl, selectedRouteId],
  );

  // Sync across tabs & poll every 2.5s so concurrent holds appear promptly
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('chihuahuenos_seat_sync');
      broadcastChannelRef.current = channel;
      channel.onmessage = () => {
        refreshState();
      };
    }

    const pollInterval = setInterval(() => {
      refreshState();
    }, 2500);

    return () => {
      clearInterval(pollInterval);
      broadcastChannelRef.current?.close();
    };
  }, [refreshState]);

  const notifySync = () => {
    broadcastChannelRef.current?.postMessage({ updatedAt: Date.now() });
  };

  const handleSelectRoute = async (routeId: string) => {
    setSelectedRouteId(routeId);
    setConcurrencyNotice(null);
    await refreshState(routeId);
  };

  const myHeldSeats = useMemo(() => {
    if (!routeDetail) return [];
    return routeDetail.seats.filter(
      (seat) => seat.status === 'RESERVED' && seat.reservedBySessionId === activeSessionId,
    );
  }, [routeDetail, activeSessionId]);

  const earliestExpiryMs = useMemo(() => {
    const times = myHeldSeats
      .map((s) => (s.reservedUntil ? new Date(s.reservedUntil).getTime() : 0))
      .filter((t) => t > 0);
    return times.length > 0 ? Math.min(...times) : null;
  }, [myHeldSeats]);

  const remainingCountdown = useMemo(() => {
    if (!earliestExpiryMs) return null;
    const diffSec = Math.max(0, Math.floor((earliestExpiryMs - nowMs) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [earliestExpiryMs, nowMs]);

  const totalAmount = useMemo(() => {
    if (!routeDetail) return 0;
    return routeDetail.price * myHeldSeats.length;
  }, [routeDetail, myHeldSeats.length]);

  const handleSeatClick = async (seat: SeatView) => {
    if (!routeDetail || pendingSeat !== null) return;

    if (seat.status === 'SOLD') return;

    const isMine = seat.status === 'RESERVED' && seat.reservedBySessionId === activeSessionId;
    const isLockedByOther =
      seat.status === 'RESERVED' && seat.reservedBySessionId && seat.reservedBySessionId !== activeSessionId;

    setPendingSeat(seat.seatNumber);
    setConcurrencyNotice(null);

    try {
      const endpoint = isMine ? 'release' : 'hold';
      const response = await fetch(`${apiUrl}/tickets/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeId: routeDetail.id,
          seatNumbers: [seat.seatNumber],
          sessionId: activeSessionId,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setConcurrencyNotice({
          type: 'error',
          text:
            payload?.message ||
            (isLockedByOther
              ? `El asiento #${seat.seatNumber} está seleccionado por otro cliente.`
              : `No fue posible apartar el asiento #${seat.seatNumber}.`),
        });
      } else {
        setConcurrencyNotice({
          type: 'info',
          text: isMine
            ? `Asiento #${seat.seatNumber} liberado y disponible para otros viajeros.`
            : `Asiento #${seat.seatNumber} apartado con bloqueo exclusivo en Redis por 10 minutos.`,
        });
      }

      await refreshState(routeDetail.id);
      notifySync();
    } catch {
      setConcurrencyNotice({
        type: 'error',
        text: 'Error de conexión con la API al actualizar el asiento.',
      });
    } finally {
      setPendingSeat(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    if (identityPreviewUrl) {
      URL.revokeObjectURL(identityPreviewUrl);
      setIdentityPreviewUrl(null);
    }

    setIdentityFile(selected);
    if (selected && selected.type.startsWith('image/')) {
      setIdentityPreviewUrl(URL.createObjectURL(selected));
    }
  };

  const handlePurchaseSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!routeDetail) return;

    if (myHeldSeats.length === 0) {
      setConcurrencyNotice({
        type: 'error',
        text: 'Selecciona al menos un asiento disponible en el mapa antes de pagar.',
      });
      return;
    }

    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      const firstInvalid = form.querySelector<HTMLElement>(':invalid');
      firstInvalid?.focus();
      return;
    }

    if (!identityFile) {
      setConcurrencyNotice({
        type: 'error',
        text: 'Debes adjuntar tu documento oficial (imagen o PDF) para verificar tu identidad.',
      });
      fileInputRef.current?.focus();
      return;
    }

    setSubmittingPurchase(true);
    setConcurrencyNotice(null);

    try {
      const formData = new FormData();
      formData.append('routeId', routeDetail.id);
      formData.append('seatNumbers', JSON.stringify(myHeldSeats.map((s) => s.seatNumber)));
      formData.append('sessionId', activeSessionId);
      formData.append('passengerName', passengerName.trim());
      formData.append('passengerEmail', passengerEmail.trim());
      formData.append('passengerPhone', passengerPhone.trim());
      formData.append('documentType', documentType);
      formData.append('identityFile', identityFile);

      const response = await fetch(`${apiUrl}/tickets/purchase`, {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        const msg = Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message;
        throw new Error(msg || 'No fue posible completar la compra.');
      }

      setActiveBoardingPass(payload);
      setConcurrencyNotice({
        type: 'success',
        text: `¡Compra confirmada (${payload.bookingCode})! Identidad verificada correctamente.`,
      });

      form.reset();
      setPassengerName('');
      setPassengerEmail('');
      setPassengerPhone('');
      setDocumentType('INE');
      setIdentityFile(null);
      if (identityPreviewUrl) {
        URL.revokeObjectURL(identityPreviewUrl);
        setIdentityPreviewUrl(null);
      }

      await refreshState(routeDetail.id);
      notifySync();
    } catch (err) {
      setConcurrencyNotice({
        type: 'error',
        text: (err as Error).message,
      });
      await refreshState(routeDetail.id);
    } finally {
      setSubmittingPurchase(false);
    }
  };

  const handleRouteCreated = async (newRoute: RouteDetail) => {
    await refreshState(newRoute.id);
    setSelectedRouteId(newRoute.id);
    setRouteDetail(newRoute);
    notifySync();
    setConcurrencyNotice({
      type: 'success',
      text: `Ruta "${newRoute.origin} – ${newRoute.destination}" agregada al catálogo.`,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Executive Header */}
      <header className="border-b border-slate-800 bg-slate-950 text-white shadow-lg">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-slate-950 shadow">
              <LuBus className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight sm:text-xl">
                Chihuahueños S.A. de C.V.
              </h1>
              <p className="text-xs text-slate-300">
                Autotransportes Interestatales • Reserva Concurrente Segura
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Multi-user concurrency simulator switcher */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5">
              <LuUsers className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <span className="text-xs font-medium text-slate-300">Sesión activa:</span>
              <div className="flex gap-1" role="group" aria-label="Simulador de usuario concurrente">
                {SESSION_PROFILES.map((profile) => {
                  const selected = activeSessionId === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => {
                        setActiveSessionId(profile.id);
                        setConcurrencyNotice({
                          type: 'info',
                          text: `Cambiaste a ${profile.label}. Los boletos apartados por otro cliente aparecen bloqueados.`,
                        });
                      }}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                        selected
                          ? 'bg-sky-600 text-white shadow-sm'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      {profile.label.split(' (')[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            <CreateRouteDialog apiUrl={apiUrl} onRouteCreated={handleRouteCreated} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {/* Global Status / Concurrency Feedback Banner */}
        {concurrencyNotice && (
          <div
            role="status"
            aria-live="polite"
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${
              concurrencyNotice.type === 'error'
                ? 'border-red-300 bg-red-50 text-red-900'
                : concurrencyNotice.type === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-sky-300 bg-sky-50 text-sky-900'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {concurrencyNotice.type === 'error' ? (
                <LuTriangleAlert className="h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
              ) : concurrencyNotice.type === 'success' ? (
                <LuCircleCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <LuShieldCheck className="h-5 w-5 shrink-0 text-sky-600" aria-hidden="true" />
              )}
              <span>{concurrencyNotice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setConcurrencyNotice(null)}
              className="text-xs font-semibold underline opacity-75 hover:opacity-100"
            >
              Ocultar
            </button>
          </div>
        )}

        {/* Step 1: Route Selection */}
        <section aria-labelledby="routes-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="routes-heading" className="text-xl font-bold text-slate-900">
                1. Selecciona tu Ruta Interestatal
              </h2>
              <p className="text-sm text-slate-600">
                Elige origen y destino o añade nuevas rutas con el botón superior.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshState()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <LuRefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Sincronizar disponibilidad
            </button>
          </div>

          {routes.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">
              No hay rutas cargadas todavía. Verifica que la API de NestJS esté ejecutándose en{' '}
              <code className="font-mono text-xs">{apiUrl}</code>.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {routes.map((route) => {
                const isSelected = route.id === selectedRouteId;
                return (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => handleSelectRoute(route.id)}
                    aria-pressed={isSelected}
                    className={`group flex flex-col justify-between rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? 'border-sky-600 bg-white ring-2 ring-sky-600 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">
                          Unidad {route.busNumber}
                        </span>
                        <span className="flex items-center gap-1">
                          <LuClock className="h-3.5 w-3.5" aria-hidden="true" />
                          {route.departureTime}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-bold text-slate-900">
                        {route.origin} <span className="text-amber-600">→</span> {route.destination}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">Duración aprox. {route.duration}</p>
                    </div>

                    <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-3">
                      <div>
                        <p className="text-xs text-slate-500">Tarifa por asiento</p>
                        <p className="text-lg font-extrabold text-slate-900">
                          ${route.price.toLocaleString('es-MX')}{' '}
                          <span className="text-xs font-semibold text-slate-500">MXN</span>
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                          {route.availableSeats} libres
                        </span>
                        {route.reservedSeats > 0 && (
                          <p className="mt-1 font-medium text-amber-700">
                            {route.reservedSeats} apartados
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Step 2 & 3: Seat Map + Checkout & Identity Verification */}
        {routeDetail && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            {/* Left: Interactive Bus Seat Map */}
            <section
              aria-labelledby="seat-map-heading"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 id="seat-map-heading" className="text-xl font-bold text-slate-900">
                    2. Selección de Asientos — {routeDetail.origin} a {routeDetail.destination}
                  </h2>
                  <p className="text-xs text-slate-600">
                    Al seleccionar un boleto se bloquea atómicamente por 10 min para evitar doble selección.
                  </p>
                </div>
                {remainingCountdown && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-900">
                    <LuClock className="h-4 w-4 text-sky-700" aria-hidden="true" />
                    Expira en {remainingCountdown}
                  </div>
                )}
              </div>

              {/* Seat Legend (non-color icons + labels) */}
              <div className="my-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded border border-emerald-500 bg-emerald-50 text-emerald-700">
                    <LuArmchair className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  Disponible
                </div>
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-sky-600 text-white">
                    <LuCircleCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  Tu selección
                </div>
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded border border-amber-500 bg-amber-100 text-amber-800">
                    <LuLock className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  Otro cliente
                </div>
                <div className="flex items-center gap-2 font-medium text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-300 text-slate-600">
                    <LuBan className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  Vendido
                </div>
              </div>

              {/* Bus Cabin Frame */}
              <div className="mx-auto max-w-md rounded-3xl border-2 border-slate-300 bg-slate-100 p-5 shadow-inner">
                <div className="mb-5 flex items-center justify-between rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
                  <span>Frente de unidad ({routeDetail.busNumber})</span>
                  <span>Cabina del Operador</span>
                </div>

                <div className="grid grid-cols-5 gap-y-3 gap-x-2">
                  {routeDetail.seats.map((seat, idx) => {
                    const colInRow = idx % 4;
                    const isMine =
                      seat.status === 'RESERVED' && seat.reservedBySessionId === activeSessionId;
                    const isLockedByOther =
                      seat.status === 'RESERVED' &&
                      Boolean(seat.reservedBySessionId) &&
                      seat.reservedBySessionId !== activeSessionId;
                    const isSold = seat.status === 'SOLD';
                    const isBusy = pendingSeat === seat.seatNumber;

                    let buttonStyle =
                      'border-emerald-500 bg-white text-emerald-800 hover:bg-emerald-50';
                    let stateLabel = 'Disponible';
                    let IconComponent = LuArmchair;

                    if (isSold) {
                      buttonStyle = 'border-slate-300 bg-slate-300 text-slate-600 cursor-not-allowed';
                      stateLabel = 'Vendido';
                      IconComponent = LuBan;
                    } else if (isLockedByOther) {
                      buttonStyle = 'border-amber-500 bg-amber-100 text-amber-900 cursor-not-allowed';
                      stateLabel = 'Apartado por otro usuario';
                      IconComponent = LuLock;
                    } else if (isMine) {
                      buttonStyle = 'border-sky-700 bg-sky-600 text-white shadow-sm hover:bg-sky-700';
                      stateLabel = 'Seleccionado por ti';
                      IconComponent = LuCircleCheck;
                    }

                    const seatButton = (
                      <button
                        key={seat.id}
                        type="button"
                        disabled={isSold || isBusy}
                        aria-disabled={isSold || isLockedByOther}
                        aria-label={`Asiento ${seat.seatNumber}: ${stateLabel}`}
                        title={`Asiento #${seat.seatNumber} — ${stateLabel}`}
                        onClick={() => handleSeatClick(seat)}
                        className={`flex h-14 flex-col items-center justify-center rounded-xl border-2 text-xs font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${buttonStyle}`}
                      >
                        <IconComponent className="h-4 w-4" aria-hidden="true" />
                        <span className="mt-0.5">#{seat.seatNumber}</span>
                      </button>
                    );

                    // Insert center aisle gap after column 2 (index % 4 === 1)
                    if (colInRow === 1) {
                      return (
                        <div key={`pair-${seat.id}`} className="contents">
                          {seatButton}
                          <div
                            aria-hidden="true"
                            className="flex items-center justify-center text-[10px] font-semibold uppercase tracking-widest text-slate-400"
                          >
                            {Math.floor(idx / 4) === 0 ? 'Pasillo' : '│'}
                          </div>
                        </div>
                      );
                    }

                    return seatButton;
                  })}
                </div>
              </div>
            </section>

            {/* Right: Checkout & Identity Verification Form (BONUS) */}
            <section
              aria-labelledby="checkout-form-title"
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-6"
            >
              <div className="border-b border-slate-200 pb-4">
                <h2 id="checkout-form-title" className="text-xl font-bold text-slate-900">
                  3. Datos del Pasajero y Verificación de Identidad
                </h2>
                <p className="text-sm text-slate-600">
                  Completa tus datos y adjunta tu identificación oficial vigente para emitir tu boleto.
                </p>
              </div>

              {/* Order Summary Box */}
              <div className="my-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Asientos seleccionados</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">
                      {myHeldSeats.length > 0
                        ? myHeldSeats.map((s) => `Asiento #${s.seatNumber}`).join(', ')
                        : 'Ningún asiento seleccionado aún'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase text-slate-500">Total a pagar</p>
                    <p className="text-xl font-extrabold text-slate-900">
                      ${totalAmount.toLocaleString('es-MX')} MXN
                    </p>
                  </div>
                </div>
              </div>

              <form
                ref={checkoutFormRef}
                aria-labelledby="checkout-form-title"
                onSubmit={handlePurchaseSubmit}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="passenger-name" className="block text-sm font-semibold text-slate-800">
                    Nombre completo del pasajero <span aria-hidden="true" className="text-red-600">*</span>
                  </label>
                  <span id="passenger-name-hint" className="field-hint">
                    Tal como aparece en tu identificación oficial
                  </span>
                  <input
                    id="passenger-name"
                    name="passengerName"
                    type="text"
                    required
                    minLength={3}
                    autoComplete="name"
                    value={passengerName}
                    onChange={(e) => setPassengerName(e.target.value)}
                    aria-describedby="passenger-name-hint"
                    data-error="passenger-name-error"
                    placeholder="Uriel Ramírez"
                    className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                  />
                  <div id="passenger-name-error" className="error-msg">
                    <span role="img" aria-label="Error">❌</span> Ingresa tu nombre completo (mínimo 3 caracteres).
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="passenger-email" className="block text-sm font-semibold text-slate-800">
                      Correo electrónico <span aria-hidden="true" className="text-red-600">*</span>
                    </label>
                    <span id="passenger-email-hint" className="field-hint">
                      Formato: tu@correo.com
                    </span>
                    <input
                      id="passenger-email"
                      name="passengerEmail"
                      type="email"
                      required
                      autoComplete="email"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={passengerEmail}
                      onChange={(e) => setPassengerEmail(e.target.value)}
                      aria-describedby="passenger-email-hint"
                      data-error="passenger-email-error"
                      placeholder="pasajero@ejemplo.com"
                      className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    />
                    <div id="passenger-email-error" className="error-msg">
                      <span role="img" aria-label="Error">❌</span> Ingresa un correo electrónico válido.
                    </div>
                  </div>

                  <div>
                    <label htmlFor="passenger-phone" className="block text-sm font-semibold text-slate-800">
                      Teléfono de contacto <span aria-hidden="true" className="text-red-600">*</span>
                    </label>
                    <span id="passenger-phone-hint" className="field-hint">
                      10 dígitos sin espacios (Ej. 6141234567)
                    </span>
                    <input
                      id="passenger-phone"
                      name="passengerPhone"
                      type="text"
                      inputMode="numeric"
                      autoComplete="tel"
                      required
                      pattern="[0-9]{10}"
                      maxLength={10}
                      value={passengerPhone}
                      onChange={(e) => setPassengerPhone(e.target.value)}
                      aria-describedby="passenger-phone-hint"
                      data-error="passenger-phone-error"
                      placeholder="6141234567"
                      className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    />
                    <div id="passenger-phone-error" className="error-msg">
                      <span role="img" aria-label="Error">❌</span> Ingresa exactamente 10 dígitos numéricos.
                    </div>
                  </div>
                </div>

                {/* Accessible visible radio group for 3 options (modern-web-guidance: forms) */}
                <fieldset className="rounded-xl border border-slate-200 p-4">
                  <legend className="px-1 text-sm font-semibold text-slate-800">
                    Tipo de documento oficial (BONUS Verificación) <span aria-hidden="true" className="text-red-600">*</span>
                  </legend>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        { value: 'INE', label: 'INE / Credencial' },
                        { value: 'PASAPORTE', label: 'Pasaporte' },
                        { value: 'LICENCIA', label: 'Licencia de conducir' },
                      ] as const
                    ).map((option) => (
                      <div key={option.value} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
                        <input
                          id={`doc-${option.value}`}
                          name="documentType"
                          type="radio"
                          value={option.value}
                          checked={documentType === option.value}
                          onChange={() => setDocumentType(option.value)}
                          className="h-4 w-4 accent-sky-600"
                        />
                        <label htmlFor={`doc-${option.value}`} className="cursor-pointer text-sm font-medium text-slate-800">
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>

                {/* Identity file upload (BONUS) */}
                <div>
                  <label htmlFor="identity-file" className="block text-sm font-semibold text-slate-800">
                    Archivo de verificación de identidad <span aria-hidden="true" className="text-red-600">*</span>
                  </label>
                  <span id="identity-file-hint" className="field-hint">
                    Sube fotografía de tu identificación oficial o documento en PDF (máx. 5 MB)
                  </span>

                  <div className="mt-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <LuUpload className="h-6 w-6 text-sky-700" aria-hidden="true" />
                        <input
                          ref={fileInputRef}
                          id="identity-file"
                          name="identityFile"
                          type="file"
                          accept="image/*,.pdf"
                          required
                          onChange={handleFileChange}
                          aria-describedby="identity-file-hint"
                          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-sky-700"
                        />
                      </div>
                      {identityFile && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          <LuFileCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          Listo ({(identityFile.size / 1024).toFixed(1)} KB)
                        </span>
                      )}
                    </div>

                    {identityPreviewUrl && (
                      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                        <img
                          src={identityPreviewUrl}
                          alt="Vista previa de identificación cargada"
                          className="mx-auto max-h-36 object-contain"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submittingPurchase || myHeldSeats.length === 0}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3 text-base font-bold text-slate-950 shadow-sm hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 transition-colors"
                >
                  <LuTicket className="h-5 w-5" aria-hidden="true" />
                  {submittingPurchase
                    ? 'Verificando identidad y emitiendo boleto...'
                    : `Confirmar y pagar $${totalAmount.toLocaleString('es-MX')} MXN`}
                </button>
              </form>
            </section>
          </div>
        )}

        {/* Confirmed Purchases & Verified Identities History */}
        <section aria-labelledby="bookings-heading" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 id="bookings-heading" className="text-lg font-bold text-slate-900">
                Boletos Emitidos e Identidades Verificadas ({bookings.length})
              </h2>
              <p className="text-xs text-slate-600">
                Registro histórico de compras confirmadas y documentos de verificación almacenados.
              </p>
            </div>
          </div>

          {bookings.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
              Aún no hay boletos emitidos en esta sesión.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {bookings.map((booking) => (
                <article
                  key={booking.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-700">
                        {booking.bookingCode}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                        <LuFileCheck className="h-3 w-3" aria-hidden="true" />
                        {booking.identityVerificationStatus}
                      </span>
                    </div>
                    <h3 className="mt-2 font-bold text-slate-900">{booking.routeLabel}</h3>
                    <p className="mt-1 text-sm text-slate-700">Pasajero: {booking.passengerName}</p>
                    <p className="text-xs text-slate-600">
                      Asientos: <strong>{booking.seatNumbers.map((s) => `#${s}`).join(', ')}</strong> •{' '}
                      Total: <strong>${booking.totalAmount.toLocaleString('es-MX')} MXN</strong>
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                    <span className="truncate text-xs text-slate-500">
                      Doc: {booking.documentType} ({booking.identityFileName})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveBoardingPass(booking)}
                      className="shrink-0 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
                    >
                      Ver boleto
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <BoardingPassDialog
        booking={activeBoardingPass}
        apiBaseRoot={apiBaseRoot}
        onClose={() => setActiveBoardingPass(null)}
      />
    </div>
  );
}
