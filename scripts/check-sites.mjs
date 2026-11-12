#!/usr/bin/env node
/**
 * Kontrola stron klientów na żywo: czy odpowiadają, czy nie wyciekają pliki robocze
 * (brief.md, wrangler.jsonc itd.), czy są robots.txt, sitemap.xml i nagłówki bezpieczeństwa.
 *
 * Użycie:
 *   node scripts/check-sites.mjs                    wszystkie domeny z plików wrangler.jsonc w clients/
 *   node scripts/check-sites.mjs domena.pl [inna.pl]  tylko podane domeny
 *   node scripts/check-sites.mjs http://localhost:8787  podgląd lokalny (`npx wrangler dev`) PRZED publikacją
 *
 * Tylko odczyt (zwykłe zapytania GET do publicznych adresów). Niczego nie zmienia.
 * Kod wyjścia 1, gdy któraś strona ma BŁĄD. Wymaga Node 18+ (wbudowany fetch).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const LEAK_PATHS = ['brief.md', 'wrangler.jsonc', '.assetsignore', '.gitignore', '.dev.vars', 'README.md'];
const TIMEOUT_MS = 15000;

function findConfigs(dir, depth = 0, out = []) {
  if (depth > 5) return out;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.wrangler' || e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) findConfigs(p, depth + 1, out);
    else if (e.name === 'wrangler.jsonc') out.push(p);
  }
  return out;
}

// wrangler.jsonc to JSON z komentarzami. Usuwamy tylko całe linie zaczynające się od //,
// żeby nie ruszyć "https://..." w wartościach.
function domainsFromConfig(path) {
  const raw = readFileSync(path, 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  let cfg;
  try { cfg = JSON.parse(raw); } catch { return []; }
  const patterns = (cfg.routes || []).map((r) => (typeof r === 'string' ? r : r.pattern)).filter(Boolean)
    .map((p) => p.replace(/\/\*$/, ''))
    .filter((p) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(p)); // pomija znaczniki ze wzoru, np. DOMENA_KLIENTA
  const apex = patterns.filter((p) => !p.startsWith('www.'));
  return apex.length ? apex : patterns;
}

async function get(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'site-check/1.0' },
    });
    const body = await res.text();
    return { status: res.status, headers: res.headers, body, finalUrl: res.url };
  } catch (e) {
    return { status: 0, error: e.cause?.code || e.name || String(e), headers: new Headers(), body: '' };
  }
}

const looksLikeHtml = (body) => /^\s*<(!doctype html|html)/i.test(body);

async function checkDomain(target) {
  const errors = [];
  const warnings = [];
  const base = /^https?:\/\//.test(target) ? target.replace(/\/+$/, '') : `https://${target}`;
  const domain = new URL(base).host;
  const isLocal = /^(localhost|127\.0\.0\.1)(:|$)/.test(domain);

  const home = await get(`${base}/`);
  if (home.status !== 200) {
    errors.push(`strona główna: ${home.status || home.error}`);
    return { domain, errors, warnings };
  }
  if (!looksLikeHtml(home.body)) errors.push('strona główna nie zwraca HTML');
  if (/SLUG_KLIENTA|DOMENA_KLIENTA|NAZWA FIRMY/.test(home.body)) errors.push('na stronie zostały znaczniki ze wzoru');
  if (/href="#"/.test(home.body)) warnings.push('na stronie jest pusty link href="#"');

  if (!isLocal && !domain.startsWith('www.')) {
    const www = await get(`https://www.${domain}/`);
    if (www.status !== 200) warnings.push(`www.${domain}: ${www.status || www.error}`);
  }

  const leaks = await Promise.all(LEAK_PATHS.map(async (p) => [p, await get(`${base}/${p}`)]));
  for (const [p, r] of leaks) {
    if (r.status === 200 && !looksLikeHtml(r.body)) errors.push(`PUBLICZNY plik roboczy: /${p}`);
  }

  const robots = await get(`${base}/robots.txt`);
  if (robots.status !== 200 || looksLikeHtml(robots.body)) warnings.push('brak robots.txt');
  else if (!/sitemap:/i.test(robots.body)) warnings.push('robots.txt bez wpisu Sitemap');

  const sitemap = await get(`${base}/sitemap.xml`);
  if (sitemap.status !== 200 || looksLikeHtml(sitemap.body)) warnings.push('brak sitemap.xml');
  else if (!isLocal && !sitemap.body.includes(domain.replace(/^www\./, ''))) warnings.push('sitemap.xml wskazuje inną domenę');
  else if (/DOMENA_KLIENTA/.test(sitemap.body + robots.body)) errors.push('robots.txt albo sitemap.xml ma znacznik ze wzoru zamiast domeny');

  if (!home.headers.get('x-content-type-options')) warnings.push('brak nagłówków bezpieczeństwa (plik _headers)');
  if (!/application\/ld\+json/.test(home.body)) warnings.push('brak danych strukturalnych JSON-LD');

  return { domain, errors, warnings };
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let domains = args.map((d) => (/^http:\/\//.test(d) ? d : d.replace(/^https:\/\//, '').replace(/\/.*$/, '')));
if (!domains.length) {
  domains = [...new Set(findConfigs('clients').flatMap(domainsFromConfig))];
  if (!domains.length) {
    console.error('Nie znalazłem żadnej domeny w clients/**/wrangler.jsonc. Uruchom z katalogu głównego repo albo podaj domenę.');
    process.exit(1);
  }
}

const results = await Promise.all(domains.map(checkDomain));
let failed = 0;
for (const r of results) {
  const state = r.errors.length ? 'BŁĄD' : r.warnings.length ? 'UWAGI' : 'OK';
  if (r.errors.length) failed++;
  console.log(`${state.padEnd(6)} ${r.domain}`);
  for (const e of r.errors) console.log(`         ! ${e}`);
  for (const w of r.warnings) console.log(`         - ${w}`);
}
console.log(`\nSprawdzono: ${results.length}, z błędem: ${failed}`);
process.exit(failed ? 1 : 0);
