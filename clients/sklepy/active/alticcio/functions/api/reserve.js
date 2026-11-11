// Routing Cloudflare Pages dla /api/reserve. Logika jest wspólna dla wszystkich restauracji RSaaS:
// rsaas/server/reserve-handler.js (build.sh kopiuje rsaas/ do .rsaas/ obok tego folderu).
// Tu zostaje tylko to, co należy do tej strony: wygląd maila i skrzynka, z której wychodzi.

import { connect } from 'cloudflare:sockets';
import { handleReserve, methodNotAllowed } from '../../.rsaas/server/reserve-handler.js';
import { sendMail } from '../../.rsaas/server/smtp.js';
import { confirmationEmail } from '../../.rsaas/server/confirmation-email.js';

const BRAND = { accent: '#C41E1E', background: '#F5EFE3', tagline: 'restauracja i wine bar' };

async function sendConfirmation(env, { to, reservation, restaurant, cancelUrl, cancelMinBefore, cancellable }) {
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new Error('Brak SMTP_USER / SMTP_PASSWORD');
  }
  const { subject, text, html } = confirmationEmail({ reservation, restaurant, brand: BRAND, cancelUrl, cancelMinBefore, cancellable });
  await sendMail({
    connect,
    host: 'smtp.gmail.com',
    port: 465,
    username: env.SMTP_USER,
    password: env.SMTP_PASSWORD.replaceAll(' ', ''),
    from: { name: restaurant.name, email: env.SMTP_USER },
    to,
    subject,
    text,
    html,
  });
}

export const onRequestPost = (context) => handleReserve(context, { sendConfirmation });

export const onRequest = methodNotAllowed;
