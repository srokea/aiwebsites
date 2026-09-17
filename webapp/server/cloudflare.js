// Dane dostepu do Cloudflare (KV storage dla kart NFC, patrz routes/reviews.js).
// Token NIGDY nie jest tu wpisany na sztywno (ten plik jest pod git) - czytany jest ze
// zmiennych srodowiskowych (.env, poza gitem - patrz .gitignore), tak jak SEED_PW_* w
// scripts/seedUsers.js.
module.exports = {
  CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID || "",
  CF_KV_NAMESPACE_ID: process.env.CF_KV_NAMESPACE_ID || "",
  CF_API_TOKEN: process.env.CF_API_TOKEN || "",
};
