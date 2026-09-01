#!/bin/bash
# Cofa appke do JUZ ZBUDOWANEJ poprzedniej wersji - bez gita, bez rebuildu, sekundy.
# Dziala tylko jesli wczesniej byl choc jeden ./redeploy.sh (to on robi te "kopie zapasowe").
# Baza danych sie NIE rusza - rollback podmienia tylko kod, dane zostaja jak sa.
#
# Uzycie:
#   ./rollback.sh       -> cofa 1 wersje wstecz (ostatni redeploy)
#   ./rollback.sh 2      -> cofa 2 wersje wstecz
set -e
cd "$(dirname "$0")"

STEP="${1:-1}"
if [ "$STEP" = "2" ]; then
  TAG=aiwebsites-webapp:previous2
else
  TAG=aiwebsites-webapp:previous
fi

if ! docker image inspect "$TAG" >/dev/null 2>&1; then
  echo "Brak zapisanej wersji '$TAG' - nie ma do czego sie cofnac."
  echo "(kopie zapasowe powstaja dopiero przy kolejnych uruchomieniach redeploy.sh)"
  exit 1
fi

echo "Cofam appke do wersji: $TAG..."
docker stop callcenter || true
docker rm callcenter || true
docker run -d --name callcenter --restart unless-stopped \
  -p 3000:3000 \
  -v "$(pwd)/webapp/data:/app/data" \
  -v "$(pwd)/webapp/.env:/app/.env" \
  "$TAG"

echo "Gotowe - appka wrocila do wersji $TAG. Kod w folderze (git) zostal nietkniety,"
echo "to tylko podmiana dzialajacego kontenera. Baza danych bez zmian."
