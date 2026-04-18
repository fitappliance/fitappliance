'use strict';

const SUBSCRIBE_ENDPOINT = '/api/subscribe';
const SUBSCRIBE_RATE_KEY = 'fitappliance-subscribe-last-at';
const CLIENT_COOLDOWN_MS = 15_000;

function readLastSubmitAt() {
  try {
    const raw = localStorage.getItem(SUBSCRIBE_RATE_KEY);
    const value = Number(raw ?? 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeLastSubmitAt(ts) {
  try {
    localStorage.setItem(SUBSCRIBE_RATE_KEY, String(ts));
  } catch {
    // localStorage might be unavailable in private mode.
  }
}

function setFormStatus(form, message, tone = 'info') {
  const statusNode = form.querySelector('[data-subscribe-status]');
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.dataset.tone = tone;
}

function setFormBusy(form, busy) {
  const submitButton = form.querySelector('button[type="submit"]');
  if (!submitButton) return;
  submitButton.disabled = busy;
  submitButton.dataset.busy = busy ? 'true' : 'false';
}

function buildPayload(form) {
  const email = String(form.elements.email?.value ?? '').trim();
  const hpCompany = String(form.elements.hp_company?.value ?? '');
  return {
    email,
    hp_company: hpCompany,
    source: window.location.pathname
  };
}

async function submitSubscription(form) {
  const payload = buildPayload(form);
  const response = await fetch(SUBSCRIBE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

  if (response.ok) return { ok: true };

  let error = 'subscription_failed';
  try {
    const parsed = await response.json();
    error = String(parsed?.error ?? error);
  } catch {
    // noop
  }
  return { ok: false, error };
}

function bindForm(form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const now = Date.now();
    if ((now - readLastSubmitAt()) < CLIENT_COOLDOWN_MS) {
      setFormStatus(form, 'Please wait a few seconds before trying again.', 'warn');
      return;
    }

    setFormBusy(form, true);
    setFormStatus(form, 'Submitting…', 'info');

    try {
      const result = await submitSubscription(form);
      if (!result.ok) {
        if (result.error === 'invalid_email') {
          setFormStatus(form, 'Please enter a valid email address.', 'error');
        } else if (result.error === 'rate_limited') {
          setFormStatus(form, 'Too many attempts. Please try again in a minute.', 'error');
        } else {
          setFormStatus(form, 'Subscription is temporarily unavailable. Please try later.', 'error');
        }
        return;
      }

      writeLastSubmitAt(now);
      setFormStatus(form, 'Check your inbox to confirm your subscription.', 'success');
      form.reset();
      window.location.href = '/subscribe';
    } catch {
      setFormStatus(form, 'Network error. Please try again.', 'error');
    } finally {
      setFormBusy(form, false);
    }
  });
}

function initSubscribeForms() {
  document.querySelectorAll('form[data-subscribe]').forEach((form) => bindForm(form));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSubscribeForms, { once: true });
} else {
  initSubscribeForms();
}
