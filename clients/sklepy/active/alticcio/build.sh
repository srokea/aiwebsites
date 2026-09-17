#!/bin/sh
# Build dla Cloudflare Pages: kopiuje do dist/ WYŁĄCZNIE pliki strony (allowlista).
# Bez tego Pages opublikowałby cały folder klienta: brief.md, UI.png, photos/, supabase/, tests/.
# Katalog functions/ zostaje na miejscu — Pages bierze go z katalogu głównego projektu, nie z dist/.
set -eu
cd "$(dirname "$0")"

rm -rf dist
mkdir dist
cp index.html privacy.html favicon.svg _headers dist/
cp -R logo fonts css js panel odwolaj dist/

# Bezpiecznik: sekrety i pliki robocze nie mają prawa trafić do publikacji.
if grep -rIlE 'sb_secret_|service_role|TURNSTILE_SECRET' dist; then
  echo "BŁĄD: w dist/ jest coś, co wygląda na sekret (lista wyżej). Przerywam." >&2
  exit 1
fi
for f in brief.md UI.png photos supabase tests functions lib .dev.vars; do
  if [ -e "dist/$f" ]; then
    echo "BŁĄD: dist/$f nie powinien być publikowany." >&2
    exit 1
  fi
done

echo "dist/ gotowy: $(find dist -type f | wc -l | tr -d ' ') plików"
