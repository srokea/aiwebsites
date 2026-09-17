// Testy funkcji /api/reserve bez sieci: fetch do Turnstile i Supabase jest podmieniony.
// Uruchom: node --test clients/sklepy/active/alticcio/tests/reserve.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, normalizePhone, parseInput } from '../functions/api/reserve.js';

const ORIGIN = 'https://alticcio.pl';
const ENV = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  TURNSTILE_SECRET_KEY: 'turnstile-secret',
};

const valid = () => ({
  requestId: '3f0b8a4e-1c2d-4e5f-9a6b-7c8d9e0f1a2b',
  date: '2026-09-25',
  time: '19:00',
  party: 2,
  duration: 120,
  name: ' Anna ',
  phone: '600 100 200',
  email: '',
  comment: 'przy oknie',
  acceptedRules: true,
  turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
});

function request(body, { origin = ORIGIN, contentType = 'application/json', raw } = {}) {
  const headers = { 'content-type': contentType, 'CF-Connecting-IP': '203.0.113.7' };
  if (origin) headers.origin = origin;
  return new Request(`${ORIGIN}/api/reserve`, {
    method: 'POST',
    headers,
    body: raw ?? JSON.stringify(body),
  });
}

let calls;
let turnstileSuccess;
let rpcResponse;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  turnstileSuccess = true;
  rpcResponse = { status: 200, body: { ok: true, reservation: { id: 'r1', date: '2026-09-25', time: '19:00', end_time: '21:00', party_size: 2, guest_name: 'Anna' } } };
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('turnstile')) {
      return Response.json({ success: turnstileSuccess });
    }
    return new Response(JSON.stringify(rpcResponse.body), { status: rpcResponse.status });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const run = async (req, env = ENV) => {
  const res = await onRequestPost({ request: req, env });
  return { status: res.status, body: await res.json(), res };
};

test('normalizePhone', () => {
  assert.equal(normalizePhone('600 100 200'), '+48600100200');
  assert.equal(normalizePhone('+48 600-100-200'), '+48600100200');
  assert.equal(normalizePhone('0048600100200'), '+48600100200');
  assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('+0600100200'), null);
  assert.equal(normalizePhone(600100200), null);
});

test('parseInput odrzuca złe dane', () => {
  assert.ok(parseInput(valid()));
  for (const [field, value] of [
    ['requestId', 'nie-uuid'], ['date', '25.09.2026'], ['time', '7:00'], ['party', 0], ['party', 2.5],
    ['duration', '120'], ['name', '   '], ['name', 'x'.repeat(81)], ['phone', 'abc'],
    ['email', 'nie-mail'], ['comment', 'x'.repeat(501)], ['acceptedRules', false], ['turnstileToken', ''],
  ]) {
    assert.equal(parseInput({ ...valid(), [field]: value }), null, `${field} = ${JSON.stringify(value)}`);
  }
});

test('poprawna rezerwacja: Turnstile, potem RPC z oczyszczonymi danymi', async () => {
  const { status, body } = await run(request(valid()));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.reservation.time, '19:00');

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /challenges\.cloudflare\.com\/turnstile/);
  const form = calls[0].init.body;
  assert.equal(form.get('secret'), 'turnstile-secret');
  assert.equal(form.get('remoteip'), '203.0.113.7');
  assert.equal(form.get('idempotency_key'), valid().requestId);

  assert.equal(calls[1].url, 'https://proj.supabase.co/rest/v1/rpc/create_reservation');
  assert.equal(calls[1].init.headers.apikey, 'sb_secret_test');
  assert.equal(calls[1].init.headers.authorization, undefined, 'klucz sb_secret nie idzie jako Bearer');
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    p_request_id: valid().requestId, p_date: '2026-09-25', p_time: '19:00', p_party: 2, p_duration: 120,
    p_name: 'Anna', p_phone: '+48600100200', p_email: null, p_comment: 'przy oknie',
  });
});

test('starszy klucz service_role (JWT) idzie też w Authorization', async () => {
  await run(request(valid()), { ...ENV, SUPABASE_SECRET_KEY: 'eyJhbGciOi.test' });
  assert.equal(calls[1].init.headers.authorization, 'Bearer eyJhbGciOi.test');
});

test('nieudany Turnstile → 403 captcha, bez dotykania bazy', async () => {
  turnstileSuccess = false;
  const { status, body } = await run(request(valid()));
  assert.equal(status, 403);
  assert.equal(body.error, 'captcha');
  assert.equal(calls.length, 1);
});

test('obce origin i brak origin → 403, bez żadnych wywołań', async () => {
  assert.equal((await run(request(valid(), { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await run(request(valid(), { origin: null }))).status, 403);
  assert.equal(calls.length, 0);
});

test('zły content-type, za duże ciało, zepsuty JSON, złe dane → bez wywołań', async () => {
  assert.equal((await run(request(valid(), { contentType: 'text/plain' }))).status, 415);
  assert.equal((await run(request(null, { raw: JSON.stringify({ ...valid(), comment: 'x'.repeat(5000) }) }))).status, 413);
  assert.equal((await run(request(null, { raw: '{nie json' }))).status, 400);
  assert.equal((await run(request({ ...valid(), acceptedRules: false }))).status, 400);
  assert.equal(calls.length, 0);
});

test('mapowanie błędów z bazy', async () => {
  const cases = [
    ['slot_taken', 409, 'slot_taken'],
    ['too_soon', 409, 'unavailable'],
    ['closed', 409, 'unavailable'],
    ['outside_hours', 409, 'unavailable'],
    ['beyond_horizon', 409, 'unavailable'],
    ['limit', 429, 'limit'],
    ['invalid_party', 422, 'invalid'],
    ['invalid', 422, 'invalid'],
  ];
  for (const [dbError, status, error] of cases) {
    rpcResponse = { status: 200, body: { ok: false, error: dbError } };
    const r = await run(request(valid()));
    assert.equal(r.status, status, dbError);
    assert.equal(r.body.error, error, dbError);
  }
});

test('awaria Supabase → 502 server', async () => {
  rpcResponse = { status: 500, body: { message: 'boom' } };
  const orig = console.error; console.error = () => {};
  try {
    const { status, body } = await run(request(valid()));
    assert.equal(status, 502);
    assert.equal(body.error, 'server');
  } finally { console.error = orig; }
});

test('brak sekretów w env → 500, bez wywołań', async () => {
  const orig = console.error; console.error = () => {};
  try {
    const { status } = await run(request(valid()), { ...ENV, TURNSTILE_SECRET_KEY: '' });
    assert.equal(status, 500);
    assert.equal(calls.length, 0);
  } finally { console.error = orig; }
});

test('odpowiedzi nie są cache’owane', async () => {
  const { res } = await run(request(valid()));
  assert.equal(res.headers.get('cache-control'), 'no-store');
});
