// Minimalny klient SMTP dla Cloudflare Workers: jedno połączenie TLS, jeden mail.
// Gmail: smtp.gmail.com:465, login = adres Gmail, hasło = „hasło do aplikacji”.
// `connect` przychodzi z zewnątrz (cloudflare:sockets w produkcji, atrapa w testach).

const ADDRESS_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

const encoder = new TextEncoder();

function base64(text) {
  let binary = '';
  for (const byte of encoder.encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function wrap76(b64) {
  return b64.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

/** Nagłówek z polskimi znakami jako encoded-words (RFC 2047), każde ≤ 75 znaków. */
export function encodeHeader(text) {
  const words = [];
  let chunk = '';
  for (const char of text) {
    if (encoder.encode(chunk + char).length > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += char;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${base64(w)}?=`).join('\r\n ');
}

function assertAddress(address) {
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) {
    throw new Error('SMTP: niepoprawny adres e-mail');
  }
}

export function buildMessage({ from, to, subject, text, html, date = new Date(), boundary, messageId }) {
  assertAddress(from.email);
  assertAddress(to);
  const domain = from.email.split('@')[1];
  boundary ??= `alt_${crypto.randomUUID().replaceAll('-', '')}`;
  messageId ??= `<${crypto.randomUUID()}@${domain}>`;

  return [
    `From: ${encodeHeader(from.name)} <${from.email}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${messageId}`,
    'MIME-Version: 1.0',
    'Auto-Submitted: auto-generated',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(base64(text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(base64(html)),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/**
 * Wysyła jeden mail. Rzuca błąd, jeśli serwer odmówi, zamknie połączenie
 * albo nie zdąży w `timeoutMs`. Błąd nigdy nie zawiera hasła.
 */
export async function sendMail({ connect, host, port, username, password, from, to, subject, text, html, timeoutMs = 8000 }) {
  const message = buildMessage({ from, to, subject, text, html });

  const socket = connect({ hostname: host, port }, { secureTransport: 'on', allowHalfOpen: false });
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  let buffer = '';

  async function readReply() {
    const lines = [];
    for (;;) {
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        lines.push(line);
        if (/^\d{3}(?: |$)/.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join(' | ') };
        if (!/^\d{3}-/.test(line)) throw new Error(`SMTP: niezrozumiała odpowiedź „${line.slice(0, 80)}”`);
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('SMTP: serwer zamknął połączenie');
      buffer += decoder.decode(value, { stream: true });
    }
  }

  async function expect(step, codes) {
    const reply = await readReply();
    if (!codes.includes(reply.code)) throw new Error(`SMTP ${step}: ${reply.text.slice(0, 200)}`);
    return reply;
  }

  const write = (data) => writer.write(encoder.encode(data));

  async function session() {
    await expect('powitanie', [220]);
    await write('EHLO alticcio\r\n');
    await expect('EHLO', [250]);
    await write(`AUTH PLAIN ${base64(`\0${username}\0${password}`)}\r\n`);
    await expect('logowanie', [235]);
    await write(`MAIL FROM:<${from.email}>\r\n`);
    await expect('MAIL FROM', [250]);
    await write(`RCPT TO:<${to}>\r\n`);
    await expect('RCPT TO', [250, 251]);
    await write('DATA\r\n');
    await expect('DATA', [354]);
    // Treść jest w base64, więc żadna linia nie zaczyna się od kropki.
    await write(`${message}.\r\n`);
    await expect('wysyłka', [250]);
    await write('QUIT\r\n');
    await readReply().catch(() => {});
  }

  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SMTP: brak odpowiedzi po ${timeoutMs} ms`)), timeoutMs);
  });
  const running = session();
  running.catch(() => {});

  try {
    await Promise.race([running, deadline]);
  } finally {
    clearTimeout(timer);
    try { await socket.close(); } catch { /* już zamknięte */ }
  }
}
