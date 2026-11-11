// Testy klienta SMTP (rsaas/server/smtp.js) i treści maila (rsaas/server/confirmation-email.js).
// Zamiast Gmaila — atrapa serwera na strumieniach, bez sieci.
// Uruchom: node --test rsaas/tests/smtp.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail, buildMessage, encodeHeader } from '../server/smtp.js';
import { confirmationEmail, phoneHref } from '../server/confirmation-email.js';

const RESTAURANT = { name: 'Alticcio', address: 'Hala Targowa, Plac Dominikański 1, 80-844 Gdańsk', phone: '531 122 360' };

const enc = new TextEncoder();
const dec = new TextDecoder();

function fakeConnect(server) {
  const log = { calls: 0, commands: [], data: null, closed: false };
  const connect = (address, options) => {
    log.calls++;
    log.address = address;
    log.options = options;
    const toServer = new TransformStream();
    const toClient = new TransformStream();
    const out = toClient.writable.getWriter();
    const input = toServer.readable.getReader();
    let buf = '';
    const pull = async () => {
      const { value, done } = await input.read();
      if (done) return false;
      buf += dec.decode(value);
      return true;
    };
    const io = {
      send: (text) => out.write(enc.encode(text)),
      async readLine() {
        for (;;) {
          const i = buf.indexOf('\r\n');
          if (i !== -1) { const line = buf.slice(0, i); buf = buf.slice(i + 2); return line; }
          if (!(await pull())) return null;
        }
      },
      async readData() {
        for (;;) {
          const i = buf.indexOf('\r\n.\r\n');
          if (i !== -1) { const data = buf.slice(0, i + 2); buf = buf.slice(i + 5); return data; }
          if (!(await pull())) return null;
        }
      },
      close: () => out.close(),
    };
    server(io, log).catch(() => {});
    return { readable: toClient.readable, writable: toServer.writable, close: async () => { log.closed = true; } };
  };
  return { connect, log };
}

async function gmailLike(io, log, { authReply = '235 2.7.0 Accepted' } = {}) {
  await io.send('220 smtp.gmail.com ESMTP ready\r\n');
  for (;;) {
    const line = await io.readLine();
    if (line === null) return;
    log.commands.push(line);
    if (line.startsWith('EHLO')) {
      // odpowiedź wielolinijkowa, pocięta w środku linii
      await io.send('250-smtp.gmail.com at your service\r\n250-AUTH LOGIN PL');
      await io.send('AIN\r\n250 SMTPUTF8\r\n');
    } else if (line.startsWith('AUTH')) {
      await io.send(`${authReply}\r\n`);
    } else if (line.startsWith('MAIL') || line.startsWith('RCPT')) {
      await io.send('250 2.1.0 OK\r\n');
    } else if (line === 'DATA') {
      await io.send('354 Go ahead\r\n');
      log.data = await io.readData();
      await io.send('250 2.0.0 OK queued\r\n');
    } else if (line === 'QUIT') {
      await io.send('221 2.0.0 closing connection\r\n');
      await io.close();
      return;
    }
  }
}

const mail = (overrides = {}) => ({
  host: 'smtp.gmail.com',
  port: 465,
  username: 'alticcio@gmail.com',
  password: 'abcdefghijklmnop',
  from: { name: 'Alticcio', email: 'alticcio@gmail.com' },
  to: 'anna@example.com',
  subject: 'Stolik w Alticcio: pt., 25 września, 19:00',
  text: 'Cześć Anna,\n.kropka na początku linii\nżółć',
  html: '<p>Cześć Anna, żółć</p>',
  ...overrides,
});

function decodeHeader(value) {
  return value.split(/\r\n /).map((word) => {
    const m = word.match(/^=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=$/);
    assert.ok(m, `encoded-word: ${word}`);
    assert.ok(word.length <= 75, `słowo ≤ 75 znaków: ${word.length}`);
    return m[1];
  }).map((b64) => Buffer.from(b64, 'base64')).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0)).toString('utf8');
}

function parts(message) {
  const bodies = [...message.matchAll(/Content-Type: (text\/\w+); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)];
  return Object.fromEntries(bodies.map(([, type, b64]) => [type, Buffer.from(b64.replace(/\r\n/g, ''), 'base64').toString('utf8')]));
}

test('wysyłka: TLS na 465, poprawna rozmowa z serwerem, treść w UTF-8', async () => {
  const { connect, log } = fakeConnect(gmailLike);
  await sendMail({ connect, ...mail() });

  assert.deepEqual(log.address, { hostname: 'smtp.gmail.com', port: 465 });
  assert.equal(log.options.secureTransport, 'on');
  assert.deepEqual(log.commands.map((c) => c.split(' ')[0]), ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
  assert.equal(Buffer.from(log.commands[1].split(' ')[2], 'base64').toString(), '\0alticcio@gmail.com\0abcdefghijklmnop');
  assert.equal(log.commands[2], 'MAIL FROM:<alticcio@gmail.com>');
  assert.equal(log.commands[3], 'RCPT TO:<anna@example.com>');
  assert.equal(log.closed, true);

  const [head] = log.data.split('\r\n\r\n');
  const subject = head.match(/^Subject: ((?:.*)(?:\r\n .*)*)/m)[1];
  assert.equal(decodeHeader(subject), 'Stolik w Alticcio: pt., 25 września, 19:00');
  assert.match(head, /^To: <anna@example\.com>$/m);
  assert.match(head, /^Auto-Submitted: auto-generated$/m);
  const body = parts(log.data);
  assert.equal(body['text/plain'], 'Cześć Anna,\n.kropka na początku linii\nżółć');
  assert.equal(body['text/html'], '<p>Cześć Anna, żółć</p>');
  assert.ok(log.data.split('\r\n').every((line) => line.length <= 998 && !line.startsWith('.')), 'linie ≤ 998 znaków, bez kropki na początku');
});

test('złe hasło → błąd bez hasła w treści', async () => {
  const { connect, log } = fakeConnect((io, l) => gmailLike(io, l, { authReply: '535-5.7.8 Username and Password not accepted\r\n535 5.7.8 BadCredentials' }));
  await assert.rejects(sendMail({ connect, ...mail() }), (err) => {
    assert.match(err.message, /logowanie: 535/);
    assert.ok(!err.message.includes('abcdefghijklmnop'));
    assert.ok(!err.message.includes(Buffer.from('\0alticcio@gmail.com\0abcdefghijklmnop').toString('base64')));
    return true;
  });
  assert.ok(!log.commands.some((c) => c.startsWith('MAIL')), 'po odmowie nic nie wysyła');
  assert.equal(log.closed, true);
});

test('serwer zamyka połączenie → błąd, nie zawieszenie', async () => {
  const { connect } = fakeConnect(async (io) => {
    await io.send('220 hello\r\n');
    await io.readLine();
    await io.close();
  });
  await assert.rejects(sendMail({ connect, ...mail(), timeoutMs: 2000 }), /zamknął połączenie/);
});

test('serwer milczy → błąd po timeoutMs', async () => {
  const { connect, log } = fakeConnect(async () => {});
  const started = Date.now();
  await assert.rejects(sendMail({ connect, ...mail(), timeoutMs: 80 }), /brak odpowiedzi po 80 ms/);
  assert.ok(Date.now() - started < 1000);
  assert.equal(log.closed, true);
});

test('adres z nową linią albo nawiasami → odmowa przed połączeniem', async () => {
  const { connect, log } = fakeConnect(gmailLike);
  for (const to of ['anna@example.com\r\nRCPT TO:<x@evil.com>', 'a<b>@example.com', 'anna@example.com> BODY=8BITMIME', '']) {
    await assert.rejects(sendMail({ connect, ...mail({ to }) }), /niepoprawny adres/, JSON.stringify(to));
  }
  assert.equal(log.calls, 0);
});

test('encodeHeader: długie polskie teksty dzielone na słowa ≤ 75 znaków', () => {
  const text = 'Zażółć gęślą jaźń — rezerwacja stolika w Alticcio na piątek, 25 września 2026 o 19:00';
  assert.equal(decodeHeader(encodeHeader(text)), text);
  const emoji = '🍷'.repeat(30);
  assert.equal(decodeHeader(encodeHeader(emoji)), emoji);
});

test('buildMessage: nagłówki bez wstrzyknięć z tematu i nazwy nadawcy', () => {
  const msg = buildMessage({ ...mail(), subject: 'Test\r\nBcc: x@evil.com', from: { name: 'Alticcio\r\nBcc: y@evil.com', email: 'alticcio@gmail.com' } });
  const head = msg.split('\r\n\r\n')[0];
  assert.ok(!/^Bcc:/mi.test(head));
});

test('treść maila: dane rezerwacji, link, termin odwołania, escapowanie HTML', () => {
  const cancelUrl = `https://alticcio.pl/odwolaj/#${'ab'.repeat(32)}`;
  const { subject, text, html } = confirmationEmail({
    reservation: { id: 'r1', date: '2026-09-25', time: '19:00', end_time: '21:00', party_size: 2, guest_name: '<img src=x onerror=alert(1)> Anna' },
    restaurant: RESTAURANT,
    brand: { accent: '#C41E1E', tagline: 'restauracja i wine bar' },
    cancelUrl,
    cancelMinBefore: 120,
  });
  assert.equal(subject, 'Stolik w Alticcio: pt., 25 września, 19:00');
  for (const part of ['piątek, 25 września 2026', '19:00–21:00 · 2 osoby', cancelUrl, 'do 2 godz. przed wizytą', '531 122 360']) {
    assert.ok(text.includes(part), `tekst zawiera: ${part}`);
  }
  assert.ok(html.includes(`href="${cancelUrl}"`));
  assert.ok(!html.includes('<img src=x'), 'imię gościa escapowane');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; Anna'));

  const zero = confirmationEmail({ reservation: { date: '2026-09-25', time: '19:00', end_time: '21:00', party_size: 5, guest_name: 'Jan' }, restaurant: RESTAURANT, cancelUrl, cancelMinBefore: 0 });
  assert.ok(zero.text.includes('do godziny rezerwacji'));

  const late = confirmationEmail({ reservation: { date: '2026-09-17', time: '12:30', end_time: '14:30', party_size: 2, guest_name: 'Ewa' }, restaurant: RESTAURANT, cancelUrl, cancelMinBefore: 120, cancellable: false });
  assert.ok(!late.text.includes(cancelUrl) && !late.html.includes(cancelUrl), 'po terminie: bez linku do odwołania');
  assert.ok(late.text.includes('Zadzwoń: 531 122 360, zwolnimy stolik.'));
  assert.ok(zero.text.includes('5 osób'));
  assert.ok(html.includes('#C41E1E') && html.includes('restauracja i wine bar'), 'kolor i podpis z brand strony');
  assert.ok(html.includes('href="tel:+48531122360"'), 'link tel: z telefonu restauracji');
  assert.ok(!zero.html.includes('#C41E1E') && !zero.html.includes('wine bar'), 'bez brand: neutralny wygląd, bez podpisu Alticcio');
});

test('treść maila: dane innej restauracji, escapowanie danych z bazy', () => {
  const other = confirmationEmail({
    reservation: { date: '2026-09-25', time: '19:00', end_time: '21:00', party_size: 2, guest_name: 'Ola' },
    restaurant: { name: 'Bistro <B>', address: '', phone: '+44 20 1234 5678' },
    cancelUrl: 'https://b.pl/odwolaj/#x', cancelMinBefore: 60,
  });
  assert.equal(other.subject, 'Stolik w Bistro <B>: pt., 25 września, 19:00');
  assert.ok(!other.text.includes('Alticcio') && !other.html.includes('Alticcio'), 'nic z Alticcio');
  assert.ok(!other.html.includes('<B>') && other.html.includes('Bistro &lt;B&gt;'), 'nazwa z bazy escapowana');
  assert.ok(other.text.includes('Bistro <B>\n') || other.text.includes('\nBistro <B>'), 'bez adresu: sama nazwa');
});

test('phoneHref', () => {
  assert.equal(phoneHref('531 122 360'), 'tel:+48531122360');
  assert.equal(phoneHref('+44 20 1234 5678'), 'tel:+442012345678');
  assert.equal(phoneHref(''), '');
});
