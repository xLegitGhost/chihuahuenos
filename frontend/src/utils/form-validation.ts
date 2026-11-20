'use client';

/**
 * Attaches accessible post-interaction validation (modern-web-guidance: validate-input-after-interaction):
 * - Initializes aria-invalid="false" without showing premature errors on load.
 * - Uses native :user-invalid when supported, and falls back to blur/input/invalid tracking otherwise.
 * - Dynamically adds/removes data-error IDs in aria-describedby only while invalid.
 */
export function attachFormValidation(form: HTMLFormElement): () => void {
  const dirtyState = new WeakMap<HTMLElement, { hasInteracted: boolean; hasBlurred: boolean }>();
  const supportsUserInvalid =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('selector(:user-invalid)');

  let announcer = document.getElementById('form-error-announcer') as HTMLDivElement | null;
  let createdAnnouncer = false;
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'form-error-announcer';
    announcer.setAttribute('aria-live', 'polite');
    announcer.className = 'visually-hidden';
    document.body.append(announcer);
    createdAnnouncer = true;
  }

  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  let announcedField: HTMLElement | null = null;

  const linkError = (el: HTMLElement, shown: boolean) => {
    const errorId = el.dataset.error;
    if (!errorId) return;
    const ids = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  };

  const announceError = (el: HTMLInputElement | HTMLTextAreaElement) => {
    const errorId = el.dataset.error;
    if (!errorId || !announcer) return;
    const errorEl = document.getElementById(errorId);
    if (!errorEl) return;
    const labelText = el.labels?.[0]?.textContent?.trim() ? `${el.labels[0].textContent.trim()}: ` : '';
    clearTimeout(announceTimer);
    announcer.textContent = '';
    announcedField = el;
    announceTimer = setTimeout(() => {
      if (announcer) {
        announcer.textContent = labelText + (errorEl.textContent?.trim() || 'Campo inválido');
      }
    }, 500);
  };

  const syncControl = (el: EventTarget | null, announce = false) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (el.type === 'radio' || el.type === 'checkbox' || el.type === 'file') return;

    const isInvalid = supportsUserInvalid
      ? el.matches(':user-invalid')
      : !el.validity.valid && Boolean(dirtyState.get(el)?.hasBlurred);

    if (!supportsUserInvalid && dirtyState.get(el)?.hasBlurred) {
      el.classList.toggle('user-invalid-fallback', isInvalid);
      el.classList.toggle('user-valid-fallback', !isInvalid);
    }

    if (isInvalid) {
      if (announce) announceError(el);
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
    } else {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      if (announcedField === el && announcer) {
        clearTimeout(announceTimer);
        announcer.textContent = '';
      }
    }
  };

  form.querySelectorAll('input, textarea').forEach((el) => {
    if (!el.hasAttribute('aria-invalid')) {
      el.setAttribute('aria-invalid', 'false');
    }
  });

  const onBlur = (e: Event) => {
    const target = e.target;
    if (target instanceof HTMLElement) {
      const state = dirtyState.get(target) || { hasInteracted: false, hasBlurred: false };
      state.hasBlurred = true;
      dirtyState.set(target, state);
    }
    syncControl(target, true);
  };

  const onInput = (e: Event) => {
    const target = e.target;
    if (target instanceof HTMLElement) {
      const state = dirtyState.get(target) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(target, state);
    }
    syncControl(target, false);
  };

  const onInvalid = (e: Event) => {
    const target = e.target;
    if (target instanceof HTMLElement) {
      dirtyState.set(target, { hasInteracted: true, hasBlurred: true });
    }
    syncControl(target, false);
  };

  const onReset = () => {
    setTimeout(() => {
      form.querySelectorAll('input, textarea').forEach((el) => {
        if (el instanceof HTMLElement) {
          dirtyState.delete(el);
          el.classList.remove('user-invalid-fallback', 'user-valid-fallback');
          el.setAttribute('aria-invalid', 'false');
          linkError(el, false);
        }
      });
    });
  };

  form.addEventListener('blur', onBlur, true);
  form.addEventListener('input', onInput);
  form.addEventListener('invalid', onInvalid, true);
  form.addEventListener('reset', onReset);

  return () => {
    clearTimeout(announceTimer);
    form.removeEventListener('blur', onBlur, true);
    form.removeEventListener('input', onInput);
    form.removeEventListener('invalid', onInvalid, true);
    form.removeEventListener('reset', onReset);
    if (createdAnnouncer && announcer?.parentNode) {
      announcer.remove();
    }
  };
}
