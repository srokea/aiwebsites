#!/usr/bin/env node
/**
 * OVH API: sprawdzanie domen klientów i przestawianie ich serwerów DNS na Cloudflare.
 *
 * Klucze czyta z ~/.ovh.conf (poza repo, NIGDY nie commituj), format:
 *   [ovh-eu]
 *   application_key=...
 *   application_secret=...
 *   consumer_key=...
 * Nowy klucz: https://eu.api.ovh.com/createToken/ z prawami
 *   GET /domain/*, GET /me/order/*, POST /domain/*\/nameServers/update
 *
 * Użycie:
 *   node scripts/ovh.mjs ns <domena> [ns1 ns2]
 *       sprawdza DNSSEC i przestawia DNS domeny na Cloudflare
 *       (domyślnie bjorn + melody, czyli para przypisana do naszego konta CF)
 *   node scripts/ovh.mjs GET domain/<domena>
 *   node scripts/ovh.mjs GET me/order/<nr>
 *   node scripts/ovh.mjs POST <ścieżka> '<json>'
 *
 * Ścieżkę podawaj bez wiodącego "/" — Git Bash zamienia "/domain" na
 * "C:/Program Files/Git/domain".
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const API = 'https://eu.api.ovh.com/1.0';
const CLOUDFLARE_NS = ['bjorn.ns.cloudflare.com', 'melody.ns.cloudflare.com'];

const conf = Object.fromEntries(
  readFileSync(join(homedir(), '.ovh.conf'), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('='))
    .map(l => l.split('=').map(s => s.trim()))
);

function normalizePath(p) {
  p = p.replace(/^[A-Za-z]:\/.*?\/Git(?=\/)/, ''); // na wypadek konwersji Git Bash
  return p.startsWith('/') ? p : '/' + p;
}

async function ovh(method, path, body = '') {
  const url = API + normalizePath(path);
  const ts = await (await fetch(`${API}/auth/time`)).text();
  const sig = '$1$' + createHash('sha1')
    .update([conf.application_secret, conf.consumer_key, method, url, body, ts].join('+'))
    .digest('hex');
  const res = await fetch(url, {
    method,
    headers: {
      'X-Ovh-Application': conf.application_key,
      'X-Ovh-Consumer': conf.consumer_key,
      'X-Ovh-Timestamp': ts,
      'X-Ovh-Signature': sig,
      'Content-Type': 'application/json',
    },
    body: body || undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${res.status} ${method} ${path}: ${data?.message ?? text}`);
  return data;
}

async function switchToCloudflare(domain, ns) {
  const info = await ovh('GET', `domain/${domain}`);
  console.log(`${domain}: stan ${info.state}, DNS ${info.nameServerType}`);

  const ds = await ovh('GET', `domain/${domain}/dsRecord`);
  if (ds.length) {
    throw new Error(`DNSSEC włączony (${ds.length} rekordów DS) — wyłącz go w panelu OVH, inaczej domena przestanie działać po zmianie DNS`);
  }

  const task = await ovh('POST', `domain/${domain}/nameServers/update`,
    JSON.stringify({ nameServers: ns.map(host => ({ host })) }));
  console.log(`Zlecono zmianę DNS na ${ns.join(', ')} (zadanie ${task.id}, status ${task.status}).`);
  console.log('Rejestr .pl publikuje zmianę z opóźnieniem, potem Cloudflare aktywuje strefę.');
}

const [cmd, ...args] = process.argv.slice(2);

try {
  if (cmd === 'ns') {
    const [domain, ...ns] = args;
    if (!domain) throw new Error('Podaj domenę: node scripts/ovh.mjs ns <domena>');
    await switchToCloudflare(domain, ns.length ? ns : CLOUDFLARE_NS);
  } else if (['GET', 'POST', 'PUT', 'DELETE'].includes(cmd)) {
    const [path, body = ''] = args;
    console.log(JSON.stringify(await ovh(cmd, path, body), null, 2));
  } else {
    console.log('Użycie: node scripts/ovh.mjs ns <domena> | GET <ścieżka> | POST <ścieżka> <json>');
    process.exit(1);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
