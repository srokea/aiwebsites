// KOPIA ZAPASOWA - poprzednia wersja Workera kart NFC (przed tlem/zdjeciem/blurem/"bez logo"),
// skopiowana z panelu Cloudflare 2026-09-23. Aktualna wersja: review-card.js.
// Powrot do starej wersji = wklej ten plik w Cloudflare (Edit code) i Deploy.

function landingPage(slug, client) {
  const logoHtml = client.logo_url
    ? `<img src="${client.logo_url}" alt="${client.business_name}" style="max-width:120px;max-height:80px;object-fit:contain;margin-bottom:16px;">`
    : `<div class="emoji">${client.emoji || '⭐'}</div>`;

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${client.business_name} – Opinie Google</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    padding: 20px;
  }
  .card {
    background: white;
    border-radius: 24px;
    padding: 48px 36px;
    text-align: center;
    max-width: 400px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  }
  .emoji { font-size: 64px; margin-bottom: 16px; }
  h1 { font-size: 26px; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; }
  .tagline { font-size: 16px; color: #666; margin-bottom: 28px; }
  .stars { font-size: 36px; margin-bottom: 28px; letter-spacing: 4px; }
  .btn {
    display: block;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    text-decoration: none;
    padding: 18px 32px;
    border-radius: 14px;
    font-size: 18px;
    font-weight: 700;
    box-shadow: 0 6px 20px rgba(102,126,234,0.5);
  }
  .powered { margin-top: 24px; font-size: 12px; color: #bbb; }
</style>
</head>
<body>
<div class="card">
  ${logoHtml}
  <h1>${client.business_name}</h1>
  <p class="tagline">${client.tagline || 'Dziękujemy za wizytę!'}</p>
  <div class="stars">⭐⭐⭐⭐⭐</div>
  <a href="/r/${slug}/click" class="btn">Napisz opinię w Google</a>
  <p class="powered">Powered by MMates</p>
</div>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "r" && parts[1]) {
      const slug = parts[1];

      if (parts[2] === "click") {
        const raw = await env.CLIENTS_KV.get(slug);
        if (!raw) return new Response("Nie znaleziono.", { status: 404 });
        const client = JSON.parse(raw);
        if (!client.google_url) return new Response("Brak linku.", { status: 404 });
        return Response.redirect(client.google_url, 302);
      }

      const raw = await env.CLIENTS_KV.get(slug);
      if (!raw) return new Response("Nie znaleziono strony.", {
        status: 404,
        headers: { "Content-Type": "text/plain;charset=UTF-8" }
      });

      const client = JSON.parse(raw);
      return new Response(landingPage(slug, client), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
