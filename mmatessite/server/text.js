// "ł" nie rozklada sie przez NFD, wiec trzeba je podmienic osobno - latwo o ten blad,
// dlatego trzymamy to w jednym miejscu (uzywa tego i slugify, i mapowanie naglowkow CSV).
function stripDiacritics(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

module.exports = { stripDiacritics, escapeHtml };
