// Routing Cloudflare Pages dla /api/reserve. Logika: lib/reserve-handler.js.

import { connect } from 'cloudflare:sockets';
import { handleReserve, methodNotAllowed } from '../../lib/reserve-handler.js';
import { sendMail } from '../../lib/smtp.js';
import { confirmationEmail } from '../../lib/confirmation-email.js';

async function sendConfirmation(env, { to, reservation, cancelUrl, cancelMinBefore, cancellable }) {
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) {
    throw new Error('Brak SMTP_USER / SMTP_PASSWORD');
  }
  const { subject, text, html } = confirmationEmail({ reservation, cancelUrl, cancelMinBefore, cancellable });
  await sendMail({
    connect,
    host: 'smtp.gmail.com',
    port: 465,
    username: env.SMTP_USER,
    password: env.SMTP_PASSWORD.replaceAll(' ', ''),
    from: { name: 'Alticcio', email: env.SMTP_USER },
    to,
    subject,
    text,
    html,
  });
}

export const onRequestPost = (context) => handleReserve(context, { sendConfirmation });

export const onRequest = methodNotAllowed;
