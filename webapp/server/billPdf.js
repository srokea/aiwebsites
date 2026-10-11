// PDF rachunku do pobrania ("Pobierz PDF" zamiast okna drukowania). Ten sam szablon co podglad
// i strona do druku (public/js/bill-render.js + css/rachunek.css), zamieniony na A4 przez Chromium
// z obrazu Dockera (Dockerfile: apt chromium). Lokalnie na Windowsie: CHROMIUM_PATH=sciezka do chrome.exe.

const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const { renderBillHtml } = require("../public/js/bill-render");

const CHROMIUM = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
const CSS_FILE = path.join(__dirname, "..", "public", "css", "rachunek.css");

function billHtmlDocument(bill) {
  const css = fs.readFileSync(CSS_FILE, "utf8");
  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<title>Rachunek ${bill.number}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap">
<style>${css}</style>
</head>
<body class="bill-page">${renderBillHtml(bill)}</body>
</html>`;
}

// bill = serializeBill(...) -> Promise<Buffer> z PDF-em
function billPdf(bill) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rachunek-"));
  const htmlPath = path.join(dir, "rachunek.html");
  const pdfPath = path.join(dir, "rachunek.pdf");
  fs.writeFileSync(htmlPath, billHtmlDocument(bill), "utf8");
  const args = [
    "--headless=new",
    "--no-sandbox", // kontener chodzi jako root
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-pdf-header-footer",
    "--virtual-time-budget=4000", // czas na doczytanie fontu Inter (bez sieci: DejaVu Sans)
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ];
  return new Promise((resolve, reject) => {
    execFile(CHROMIUM, args, { timeout: 30000 }, (err) => {
      try {
        if (err || !fs.existsSync(pdfPath)) return reject(err || new Error("Chromium nie zapisał PDF-a"));
        resolve(fs.readFileSync(pdfPath));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}

module.exports = { billPdf };
