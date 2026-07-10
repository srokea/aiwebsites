#!/usr/bin/env node
/**
 * Scraper leadów z Google Maps → CSV/JSON zgodny ze schematem arkusza
 * (AI_WEB_AGENCY_CONTEXT.md §4): nazwa, telefon, miasto, www, facebook,
 * instagram, booksy, liczba opinii, ocena, jakość(1-5), status, notatki.
 *
 * Użycie:
 *   node scripts/scrape-gmaps.mjs "fryzjer Piotrków Trybunalski" [opcje]
 *
 * Opcje:
 *   --limit N       maks. liczba firm (domyślnie 20)
 *   --no-details    pomiń wchodzenie na karty miejsc (szybciej, ale bez telefonu/www)
 *   --headed        pokaż okno przeglądarki (debug / captcha)
 *   --out PATH      ścieżka wyjściowa bez rozszerzenia (domyślnie leads/<query>-<data>)
 *
 * Uwaga: skrypt do użytku własnego na małą skalę (ręczny research zamiast
 * przeklikiwania Maps). Nie odpalać masowo/równolegle.
 */

import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const args = process.argv.slice(2);
const query = args.find((a) => !a.startsWith('--'));
if (!query) {
  console.error('Podaj zapytanie, np.: node scripts/scrape-gmaps.mjs "fryzjer Piotrków Trybunalski"');
  process.exit(1);
}
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const LIMIT = parseInt(opt('limit', '20'), 10);
const DETAILS = !flag('no-details');
const HEADED = flag('headed');
const slug = query.toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/gi, '-').replace(/^-|-$/g, '');
const OUT = opt('out', join('leads', `${slug}-${new Date().toISOString().slice(0, 10)}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function classifyUrl(url) {
  if (!url) return { www: '', facebook: '', instagram: '', booksy: '' };
  const u = url.toLowerCase();
  if (u.includes('facebook.com')) return { www: '', facebook: url, instagram: '', booksy: '' };
  if (u.includes('instagram.com')) return { www: '', facebook: '', instagram: url, booksy: '' };
  if (u.includes('booksy.com')) return { www: '', facebook: '', instagram: '', booksy: url };
  return { www: url, facebook: '', instagram: '', booksy: '' };
}

async function acceptConsent(page) {
  try {
    if (!page.url().includes('consent.google.')) return;
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /zaakceptuj wszystko|accept all|odrzuć wszystko|reject all/i.test(b.textContent || ''),
      );
      if (btn) btn.click();
    });
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  } catch { /* brak ekranu zgody */ }
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: HEADED ? false : 'new',
    args: ['--no-sandbox', '--disable-gpu', '--lang=pl-PL'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pl-PL,pl;q=0.9' });
  // headless UA dostaje od Google okrojoną wersję Maps (m.in. bez liczby opinii)
  const ua = await browser.userAgent();
  await page.setUserAgent(ua.replace('HeadlessChrome', 'Chrome'));

  console.error(`Szukam: "${query}" (limit ${LIMIT}, details=${DETAILS})`);
  await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=pl`, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  });
  await acceptConsent(page);
  await page.waitForSelector('div[role="feed"], a.hfpxzc, h1', { timeout: 30000 });

  // Scrolluj feed wyników aż do limitu albo końca listy
  let prevCount = 0, stableRounds = 0;
  for (let i = 0; i < 40; i++) {
    const count = await page.evaluate(() => document.querySelectorAll('a.hfpxzc').length);
    if (count >= LIMIT) break;
    const atEnd = await page.evaluate(() =>
      /osiągnięto koniec listy|reached the end/i.test(document.querySelector('div[role="feed"]')?.textContent || ''),
    );
    if (atEnd) break;
    stableRounds = count === prevCount ? stableRounds + 1 : 0;
    if (stableRounds >= 4) break;
    prevCount = count;
    await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (feed) feed.scrollBy(0, feed.scrollHeight);
    });
    await sleep(900);
  }

  // Ekstrakcja z kart feedu
  const cards = await page.evaluate((limit) => {
    return [...document.querySelectorAll('a.hfpxzc')].slice(0, limit).map((a) => {
      const card = a.closest('div[jsaction]')?.parentElement || a.parentElement;
      const ratingLabel = card?.querySelector('span[role="img"]')?.getAttribute('aria-label') || '';
      // "4,9-gwiazdkowy" / "4.9 stars"
      const rating = ratingLabel.replace(',', '.').match(/(\d+(?:\.\d+)?)(?:-gwiazdkow|\s*star|\s*gwiazd)/);
      // liczba opinii: span.UY7F9 w karcie feedu ("(9)"), fallback: tekst karty
      const text = card?.textContent || '';
      const countEl = card?.querySelector('span.UY7F9')?.textContent || '';
      const count = (countEl || text).match(/\((\d{1,3}(?:[\s\u202f\u00a0]?\d{3})*)\)/);
      return {
        nazwa: a.getAttribute('aria-label') || '',
        url: a.href,
        ocena: rating ? rating[1] : '',
        liczba_opinii: count ? count[1].replace(/[\s ]/g, '') : '',
        tekst_karty: text.slice(0, 300),
      };
    });
  }, LIMIT);
  console.error(`Znaleziono ${cards.length} firm w wynikach.`);

  const leads = [];
  for (const [i, c] of cards.entries()) {
    const lead = {
      nazwa: c.nazwa, telefon: '', miasto: '', www: '', facebook: '', instagram: '',
      booksy: '', liczba_opinii: c.liczba_opinii, ocena: c.ocena,
      jakosc: '', status: 'nowy', notatki: '', maps_url: c.url,
    };
    // telefon bywa widoczny już w karcie feedu
    const phoneInCard = c.tekst_karty.match(/(\+?48[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}/);
    if (phoneInCard) lead.telefon = phoneInCard[0].replace(/[\s-]/g, '');

    if (DETAILS) {
      try {
        await page.goto(c.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('button[data-item-id], a[data-item-id]', { timeout: 15000 }).catch(() => {});
        const d = await page.evaluate(() => {
          const get = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '';
          const phone = get('button[data-item-id^="phone"]', 'data-item-id').replace(/^phone:tel:/, '');
          const website = document.querySelector('a[data-item-id="authority"]')?.href || '';
          const address = document.querySelector('button[data-item-id="address"]')?.getAttribute('aria-label') || '';
          // nagłówek miejsca: "4,9 ... (9)" — liczba opinii w nawiasie,
          // fallback: dowolny element z aria-label "N opinii"
          const header = document.querySelector('div.F7nice')?.textContent || '';
          let rc = header.match(/\((\d{1,3}(?:[\s  ]?\d{3})*)\)/);
          if (!rc) {
            const el = [...document.querySelectorAll('[aria-label]')].find((e) =>
              /^\d[\d\s  ]*\s*opini/i.test(e.getAttribute('aria-label') || ''));
            if (el) rc = el.getAttribute('aria-label').match(/^(\d[\d\s  ]*)/);
          }
          return { phone, website, address, reviews: rc ? rc[1].replace(/[\s  ]/g, '') : '' };
        });
        if (d.phone) lead.telefon = d.phone.replace(/[\s-]/g, '');
        if (d.reviews) lead.liczba_opinii = d.reviews;
        Object.assign(lead, classifyUrl(d.website));
        // miasto = ostatni człon adresu po kodzie pocztowym
        const city = d.address.match(/\d{2}-\d{3}\s+([^,]+)/);
        if (city) lead.miasto = city[1].trim();
        await sleep(700 + Math.random() * 800);
      } catch (e) {
        lead.notatki = 'nie udało się pobrać szczegółów';
      }
    }
    leads.push(lead);
    console.error(`  [${i + 1}/${cards.length}] ${lead.nazwa} ${lead.telefon ? '☎ ' + lead.telefon : ''}`);
  }

  await browser.close();

  mkdirSync(dirname(OUT), { recursive: true });
  const cols = ['nazwa', 'telefon', 'miasto', 'www', 'facebook', 'instagram', 'booksy',
    'liczba_opinii', 'ocena', 'jakosc', 'status', 'notatki', 'maps_url'];
  const esc = (v) => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const csv = [cols.join(','), ...leads.map((l) => cols.map((k) => esc(String(l[k] ?? ''))).join(','))].join('\n');
  writeFileSync(`${OUT}.csv`, csv);
  writeFileSync(`${OUT}.json`, JSON.stringify(leads, null, 2));
  console.error(`Zapisano: ${OUT}.csv oraz ${OUT}.json (${leads.length} leadów)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
