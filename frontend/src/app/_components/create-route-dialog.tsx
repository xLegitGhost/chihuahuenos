'use client';

import { useEffect, useRef, useState } from 'react';
import { LuBus, LuPlus, LuX } from 'react-icons/lu';
import type { RouteDetail } from '@/types/ticketing';
import { attachFormValidation } from '@/utils/form-validation';

interface CreateRouteDialogProps {
  apiUrl: string;
  onRouteCreated: (route: RouteDetail) => void;
}

export default function CreateRouteDialog({ apiUrl, onRouteCreated }: CreateRouteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [price, setPrice] = useState('');
  const [departureTime, setDepartureTime] = useState('09:00 AM');
  const [duration, setDuration] = useState('6h 30m');
  const [busNumber, setBusNumber] = useState('');
  const [totalSeats, setTotalSeats] = useState('24');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    return attachFormValidation(form);
  }, []);

  const openModal = () => {
    setErrorMessage(null);
    dialogRef.current?.showModal();
  };

  const closeModal = () => {
    dialogRef.current?.close();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      const firstInvalid = form.querySelector<HTMLElement>(':invalid');
      firstInvalid?.focus();
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiUrl}/routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: origin.trim(),
          destination: destination.trim(),
          price: Number(price),
          departureTime: departureTime.trim(),
          duration: duration.trim(),
          busNumber: busNumber.trim() || undefined,
          totalSeats: Number(totalSeats) || 24,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
        throw new Error(msg || 'No fue posible registrar la ruta.');
      }

      onRouteCreated(data);
      form.reset();
      setOrigin('');
      setDestination('');
      setPrice('');
      setDepartureTime('09:00 AM');
      setDuration('6h 30m');
      setBusNumber('');
      setTotalSeats('24');
      closeModal();
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-sm hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 transition-colors"
      >
        <LuPlus className="h-4 w-4" aria-hidden="true" />
        Añadir nueva ruta
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="create-route-title"
        {...({ closedby: 'any' } as Record<string, string>)}
        className="m-auto w-[min(92vw,34rem)] rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <LuBus className="h-5 w-5 text-amber-400" aria-hidden="true" />
            <h2 id="create-route-title" className="text-lg font-bold">
              Registrar Nueva Ruta Interestatal
            </h2>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="Cerrar diálogo"
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LuX className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 p-6">
          {errorMessage && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            >
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="route-origin" className="block text-sm font-semibold text-slate-800">
                Estado de origen <span aria-hidden="true" className="text-red-600">*</span>
              </label>
              <span id="route-origin-hint" className="field-hint">
                Ej. Jalisco, Sonora, Chiapas
              </span>
              <input
                id="route-origin"
                name="origin"
                type="text"
                required
                minLength={3}
                autoFocus
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                aria-describedby="route-origin-hint"
                data-error="route-origin-error"
                placeholder="Guadalajara"
                className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
              <div id="route-origin-error" className="error-msg">
                <span role="img" aria-label="Error">❌</span> Ingresa un estado de origen válido (mínimo 3 letras).
              </div>
            </div>

            <div>
              <label htmlFor="route-destination" className="block text-sm font-semibold text-slate-800">
                Estado de destino <span aria-hidden="true" className="text-red-600">*</span>
              </label>
              <span id="route-destination-hint" className="field-hint">
                Ej. Monterrey, CDMX, Mérida
              </span>
              <input
                id="route-destination"
                name="destination"
                type="text"
                required
                minLength={3}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                aria-describedby="route-destination-hint"
                data-error="route-destination-error"
                placeholder="Monterrey"
                className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
              <div id="route-destination-error" className="error-msg">
                <span role="img" aria-label="Error">❌</span> Ingresa un estado de destino válido (mínimo 3 letras).
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="route-price" className="block text-sm font-semibold text-slate-800">
                Precio por boleto (MXN) <span aria-hidden="true" className="text-red-600">*</span>
              </label>
              <span id="route-price-hint" className="field-hint">
                Mínimo $100 MXN (solo dígitos)
              </span>
              <input
                id="route-price"
                name="price"
                type="text"
                inputMode="numeric"
                required
                pattern="[1-9][0-9]{2,4}"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                aria-describedby="route-price-hint"
                data-error="route-price-error"
                placeholder="1250"
                className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
              <div id="route-price-error" className="error-msg">
                <span role="img" aria-label="Error">❌</span> Ingresa un precio numérico desde $100 MXN.
              </div>
            </div>

            <div>
              <label htmlFor="route-seats" className="block text-sm font-semibold text-slate-800">
                Total de asientos <span aria-hidden="true" className="text-red-600">*</span>
              </label>
              <span id="route-seats-hint" className="field-hint">
                Capacidad entre 8 y 48 asientos
              </span>
              <input
                id="route-seats"
                name="totalSeats"
                type="text"
                inputMode="numeric"
                required
                pattern="([89]|[1-3][0-9]|4[0-8])"
                value={totalSeats}
                onChange={(e) => setTotalSeats(e.target.value)}
                aria-describedby="route-seats-hint"
                data-error="route-seats-error"
                className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
              <div id="route-seats-error" className="error-msg">
                <span role="img" aria-label="Error">❌</span> Ingresa un número entero entre 8 y 48.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="route-departure" className="block text-sm font-semibold text-slate-800">
                Salida <span aria-hidden="true" className="text-red-600">*</span>
              </label>
              <span id="route-departure-hint" className="field-hint">
                Ej. 09:00 AM
              </span>
              <input
                id="route-departure"
                name="departureTime"
                type="text"
                required
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                aria-describedby="route-departure-hint"
                data-error="route-departure-error"
                className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
              <div id="route-departure-error" className="error-msg">
                <span role="img" aria-label="Error">❌</span> Indica la hora de salida.
              </div>
            </div>

            <div>
              <label htmlFor="route-duration" className="block text-sm font-semibold text-slate-800">
                Duración <span aria-hidden="true" className="text-red-600">*</span>
              </label>
              <span id="route-duration-hint" className="field-hint">
                Ej. 6h 30m
              </span>
              <input
                id="route-duration"
                name="duration"
                type="text"
                required
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                aria-describedby="route-duration-hint"
                data-error="route-duration-error"
                className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
              <div id="route-duration-error" className="error-msg">
                <span role="img" aria-label="Error">❌</span> Indica la duración estimada.
              </div>
            </div>

            <div>
              <label htmlFor="route-bus" className="block text-sm font-semibold text-slate-800">
                Unidad
              </label>
              <span id="route-bus-hint" className="field-hint">
                Opcional (Ej. CH-510)
              </span>
              <input
                id="route-bus"
                name="busNumber"
                type="text"
                value={busNumber}
                onChange={(e) => setBusNumber(e.target.value)}
                aria-describedby="route-bus-hint"
                placeholder="CH-510"
                className="validated-input w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Guardando ruta...' : 'Guardar ruta'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
