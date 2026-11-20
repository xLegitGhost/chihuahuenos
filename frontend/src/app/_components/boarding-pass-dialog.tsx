'use client';

import { useEffect, useRef } from 'react';
import { LuCircleCheck, LuExternalLink, LuFileCheck, LuTicket, LuX } from 'react-icons/lu';
import type { TicketBooking } from '@/types/ticketing';

interface BoardingPassDialogProps {
  booking: TicketBooking | null;
  apiBaseRoot: string;
  onClose: () => void;
}

export default function BoardingPassDialog({
  booking,
  apiBaseRoot,
  onClose,
}: BoardingPassDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (booking && !dialog.open) {
      dialog.showModal();
    } else if (!booking && dialog.open) {
      dialog.close();
    }
  }, [booking]);

  const handleClose = () => {
    dialogRef.current?.close();
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="boarding-pass-title"
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto w-[min(92vw,34rem)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl"
    >
      {booking && (
        <div>
          <div className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
            <div className="flex items-center gap-2.5">
              <LuTicket className="h-5 w-5 text-amber-400" aria-hidden="true" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-amber-300">
                  Chihuahueños S.A. de C.V.
                </p>
                <h2 id="boarding-pass-title" className="text-lg font-bold">
                  Pase de Abordar Digital
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Cerrar pase de abordar"
              className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <LuX className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-emerald-900">
                <LuCircleCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                    Compra Confirmada
                  </p>
                  <p className="font-mono text-base font-bold">{booking.bookingCode}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                <LuFileCheck className="h-3.5 w-3.5" aria-hidden="true" />
                IDENTIDAD VERIFICADA ({booking.documentType})
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="col-span-2">
                <dt className="text-xs font-medium uppercase text-slate-500">Ruta Interestatal</dt>
                <dd className="mt-0.5 text-base font-bold text-slate-900">{booking.routeLabel}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Pasajero</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">{booking.passengerName}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Asientos</dt>
                <dd className="mt-0.5 font-bold text-sky-700">
                  {booking.seatNumbers.map((s) => `#${s}`).join(', ')}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Correo</dt>
                <dd className="mt-0.5 truncate text-slate-700">{booking.passengerEmail}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-slate-500">Total Pagado</dt>
                <dd className="mt-0.5 text-base font-bold text-slate-900">
                  ${booking.totalAmount.toLocaleString('es-MX')} MXN
                </dd>
              </div>
            </dl>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Documento de identidad adjunto
                  </p>
                  <p className="text-sm font-medium text-slate-800">
                    {booking.identityFileName} ({(booking.identityFileSize / 1024).toFixed(1)} KB)
                  </p>
                </div>
                <a
                  href={`${apiBaseRoot}${booking.identityDocumentUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
                >
                  Ver archivo
                  <LuExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
              {booking.identityMimeType.startsWith('image/') && (
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  <img
                    src={`${apiBaseRoot}${booking.identityDocumentUrl}`}
                    alt={`Documento de identidad de ${booking.passengerName}`}
                    className="max-h-48 w-full object-contain"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
