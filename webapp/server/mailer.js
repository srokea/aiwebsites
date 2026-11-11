// Wysylka maili (rachunki do klientow) przez SMTP - domyslnie Gmail z haslem aplikacji.
// .env: SMTP_USER=adres@gmail.com, SMTP_PASS=haslo aplikacji (16 znakow, Konto Google ->
// Bezpieczenstwo -> Hasla aplikacji), opcjonalnie SMTP_HOST / SMTP_PORT (domyslnie smtp.gmail.com:465).
// Bez SMTP_USER/SMTP_PASS okienko "Wyslij mailem" mowi, czego brakuje, i nic nie wysyla.
// Gmail sam odklada wyslane przez SMTP maile do "Wyslanych", wiec kopia zostaje w skrzynce.

const nodemailer = require("nodemailer");

const mailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
const mailSender = () => process.env.SMTP_USER || "";

let transport = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

// fromName = imie i nazwisko z Moich danych (adres nadawcy to zawsze SMTP_USER - inaczej Gmail podmieni)
function sendMail({ fromName, replyTo, ...msg }) {
  return getTransport().sendMail({
    from: { name: fromName || mailSender(), address: mailSender() },
    ...(replyTo && replyTo !== mailSender() ? { replyTo } : {}),
    ...msg,
  });
}

module.exports = { mailConfigured, mailSender, sendMail };
