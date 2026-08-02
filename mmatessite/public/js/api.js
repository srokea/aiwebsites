const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Blad ${res.status}`);
    return res.json();
  },
  async patch(url, body) {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Blad ${res.status}`);
    return res.json();
  },
  async del(url) {
    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Blad ${res.status}`);
    return res.json();
  },
  async postForm(url, formData) {
    const res = await fetch(url, { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Blad ${res.status}`);
    return data;
  },
};

function progressClass(pct) {
  if (pct >= 70) return "high";
  if (pct >= 30) return "mid";
  return "low";
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- tlo: pojedyncze latajace drobinki (na kazdej stronie) ----------
function initParticles() {
  const container = document.getElementById("bg-particles");
  if (!container) return;
  const rand = (min, max) => min + Math.random() * (max - min);

  const frag = document.createDocumentFragment();
  for (let i = 0; i < 85; i++) {
    const p = document.createElement("span");
    p.className = "particle";
    const dur = rand(8, 18);
    p.style.left = `${rand(0, 100)}%`;
    p.style.top = `${rand(0, 100)}%`;
    p.style.setProperty("--size", `${rand(1.2, 3).toFixed(1)}px`);
    p.style.setProperty("--dx", `${rand(-14, 14).toFixed(1)}vw`);
    p.style.setProperty("--dy", `${rand(-16, 16).toFixed(1)}vh`);
    p.style.setProperty("--dur", `${dur.toFixed(1)}s`);
    p.style.setProperty("--delay", `${-rand(0, dur).toFixed(1)}s`); // ujemne opoznienie = start w losowym momencie lotu
    p.style.setProperty("--tdur", `${rand(3, 7).toFixed(1)}s`);
    p.style.setProperty("--tdelay", `${-rand(0, 7).toFixed(1)}s`);
    p.style.setProperty("--peak", rand(0.25, 0.6).toFixed(2));
    frag.appendChild(p);
  }
  container.appendChild(frag);
}
