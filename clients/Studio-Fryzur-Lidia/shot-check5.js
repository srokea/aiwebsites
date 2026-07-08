const puppeteer = require('puppeteer-core');
async function main() {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto('http://localhost:8796/index.html', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: process.argv[2] + '-hero-nobadge.png' });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: process.argv[2] + '-map-tint.png' });
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
