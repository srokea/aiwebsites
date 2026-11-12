#!/usr/bin/env node
/**
 * Kod QR do druku (SVG, czyli wektor - nie traci ostrości na stojaku ani wizytówce).
 *
 * Użycie:
 *   node scripts/qr.mjs <adres> <plik-wyjsciowy.svg>
 *   node scripts/qr.mjs https://salon-przyklad.pl/opinia/ clients/.../qr-opinia.svg
 *
 * Kod prowadzi ZAWSZE do adresu na domenie klienta (np. /opinia/), a nie wprost do Google.
 * Dzięki temu po wydrukowaniu można zmienić, dokąd strona kieruje, bez ponownego druku.
 */

import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';

const [url, out] = process.argv.slice(2);
if (!url || !out || !/^https:\/\//.test(url) || !out.endsWith('.svg')) {
  console.error('Użycie: node scripts/qr.mjs https://domena-klienta.pl/opinia/ sciezka/qr-opinia.svg');
  process.exit(1);
}

// Poziom korekcji Q: kod czyta się mimo zabrudzenia albo zagięcia wydruku.
const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'Q', margin: 2 });
writeFileSync(out, svg);
console.log(`Zapisano ${out} -> ${url}`);
console.log('Przed drukiem zeskanuj kod telefonem i sprawdź, czy otwiera właściwą stronę.');
