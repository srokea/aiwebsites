#!/usr/bin/env node
/**
 * Kanoniczny skrypt zrzutów ekranu stron klientów (mobile-first: zawsze
 * robi wersję mobilną I desktopową). Zastępuje ad-hocowe shot.js.
 *
 * Użycie:
 *   node scripts/screenshot.mjs clients/Studio-Fryzur-Lidia [plik.html] [opcje]
 *
 * Opcje:
 *   --out DIR      katalog wyjściowy (domyślnie screenshots/<klient>/)
 *   --viewport     dodatkowo zrzuty samego viewportu (hero) zamiast tylko full-page
 *
 * Sam uruchamia lokalny serwer statyczny (relatywne ścieżki photos/ działają),
 * po zakończeniu go zamyka. Nazwy plików: <strona>-mobile.png, <strona>-desktop.png.
 */

import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, statSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname, basename, resolve } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
};
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
];

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const dir = positional[0];
if (!dir) {
  console.error('Podaj katalog klienta, np.: node scripts/screenshot.mjs clients/Studio-Fryzur-Lidia');
  process.exit(1);
}
const root = resolve(dir);
const pages = positional.length > 1
  ? positional.slice(1)
  : readdirSync(root).filter((f) => f.endsWith('.html'));
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i !== -1 && args[i + 1] ? args[i + 1] : d; };
const outDir = resolve(opt('out', join('screenshots', basename(root))));
mkdirSync(outDir, { recursive: true });

const server = createServer((req, res) => {
  try {
    const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(root) || !statSync(path).isFile()) throw new Error('404');
    res.writeHead(200, { 'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream' });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});

for (const file of pages) {
  const name = basename(file, '.html');
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    await page.goto(`http://localhost:${port}/${file}`, { waitUntil: 'networkidle0', timeout: 60000 });
    // przescrolluj stronę, żeby loading="lazy" zdążyło wczytać obrazy
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: join(outDir, `${name}-${vp.name}.png`), fullPage: true });
    if (flag('viewport')) {
      await page.screenshot({ path: join(outDir, `${name}-${vp.name}-viewport.png`) });
    }
    await page.close();
    console.error(`✓ ${name}-${vp.name}.png`);
  }
}

await browser.close();
server.close();
console.error(`Zapisano do: ${outDir}`);
