// Treść maila z potwierdzeniem rezerwacji (tekst + HTML).
// Style inline i układ na tabelach, bo tak wymagają programy pocztowe.

import { formatDuration, formatLongDate, formatPeople, formatShortDate } from '../js/format.js';

const PHONE = '531 122 360';
const PHONE_HREF = 'tel:+48531122360';
const ADDRESS = 'Hala Targowa, Plac Dominikański 1, 80-844 Gdańsk';

const escapeHtml = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function cancelRule(minutes) {
  return minutes > 0
    ? `Odwołać online możesz do ${formatDuration(minutes)} przed wizytą.`
    : 'Odwołać online możesz do godziny rezerwacji.';
}

export function confirmationEmail({ reservation: r, cancelUrl, cancelMinBefore, cancellable = true }) {
  const when = formatLongDate(r.date);
  const hours = `${r.time}–${r.end_time}`;
  const people = formatPeople(r.party_size);
  const rule = cancelRule(cancelMinBefore);

  const subject = `Stolik w Alticcio: ${formatShortDate(r.date)}, ${r.time}`;

  const text = [
    `Cześć ${r.guest_name},`,
    '',
    'rezerwacja przyjęta. Czekamy na Ciebie:',
    '',
    when,
    `${hours} · ${people}`,
    `Alticcio, ${ADDRESS}`,
    '',
    ...(cancellable
      ? ['Nie dasz rady przyjść? Odwołaj rezerwację tutaj:', cancelUrl, rule]
      : [`Nie dasz rady przyjść? Zadzwoń: ${PHONE}, zwolnimy stolik.`]),
    '',
    `Masz pytanie albo chcesz coś zmienić? Odpowiedz na tego maila albo zadzwoń: ${PHONE}.`,
    '',
    'Do zobaczenia!',
    'Alticcio',
  ].join('\n');

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${e(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#F5EFE3;">
<div style="display:none;max-height:0;overflow:hidden;">${e(`${when}, ${hours} · ${people}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5EFE3;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
      <tr><td style="padding:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:4px;font-weight:bold;color:#C41E1E;">ALTICCIO</td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid #DDD1BD;border-radius:8px;padding:28px 24px;font-family:Georgia,'Times New Roman',serif;color:#14110F;">
        <p style="margin:0 0 6px;font-size:16px;line-height:1.5;">Cześć ${e(r.guest_name)},</p>
        <h1 style="margin:0 0 20px;font-size:24px;line-height:1.25;font-weight:normal;">rezerwacja przyjęta. Czekamy na&nbsp;Ciebie!</h1>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #DDD1BD;border-bottom:1px solid #DDD1BD;margin:0 0 24px;">
          <tr><td style="padding:16px 0;font-size:16px;line-height:1.6;">
            <strong style="font-size:18px;">${e(when)}</strong><br>
            ${e(hours)} · ${e(people)}<br>
            <span style="color:#5F5349;">Alticcio, ${e(ADDRESS)}</span>
          </td></tr>
        </table>
        <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Nie dasz rady przyjść? Daj nam znać, a&nbsp;stolik dostanie ktoś inny.</p>
        ${cancellable ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
          <tr><td style="background:#C41E1E;border-radius:6px;">
            <a href="${e(cancelUrl)}" style="display:inline-block;padding:14px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#F5EFE3;text-decoration:none;">Odwołaj rezerwację</a>
          </td></tr>
        </table>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#5F5349;">${e(rule)}</p>` : `<p style="margin:0 0 24px;font-size:16px;line-height:1.5;">Zadzwoń: <a href="${PHONE_HREF}" style="color:#C41E1E;white-space:nowrap;">${PHONE}</a>, zwolnimy stolik.</p>`}
        <p style="margin:0;font-size:16px;line-height:1.5;">Masz pytanie albo chcesz coś zmienić? Odpowiedz na tego maila albo zadzwoń: <a href="${PHONE_HREF}" style="color:#C41E1E;white-space:nowrap;">${PHONE}</a>.</p>
      </td></tr>
      <tr><td style="padding:20px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#5F5349;">
        Alticcio · restauracja i wine bar · ${e(ADDRESS)}<br>
        Ten mail wysłaliśmy, bo na naszej stronie zarezerwowano stolik z tym adresem e-mail.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}
