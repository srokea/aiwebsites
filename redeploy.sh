#!/bin/bash
# Aktualizacja appki: sciaga najnowszy kod z GitHuba i przebudowuje kontener.
# Baza danych (webapp/data) jest w .gitignore, wiec git jej nigdy nie rusza.
# Przed kazdym rebuildem zachowuje 2 poprzednie dzialajace obrazy (patrz rollback.sh).
# Po restarcie SAM sprawdza, czy appka wstala i odpowiada - jesli nie, automatycznie
# cofa sie do poprzedniej dzialajacej wersji, bez pytania.
# Uzycie (przez SSH na serwerze): cd /DATA/AppData/aiwebsites-repo && ./redeploy.sh
set -e
cd "$(dirname "$0")"

echo "1) Zabezpieczam poprzednie wersje obrazu (backup do rollbacku)..."
docker image inspect aiwebsites-webapp:previous >/dev/null 2>&1 && \
  docker tag aiwebsites-webapp:previous aiwebsites-webapp:previous2 || true
docker image inspect aiwebsites-webapp:latest >/dev/null 2>&1 && \
  docker tag aiwebsites-webapp:latest aiwebsites-webapp:previous || true

echo "2) Sciagam najnowszy kod (git pull)..."
git pull

echo "3) Buduje nowy obraz..."
# Jesli to sie wywali (np. bledny kod, brakujacy plik) - skrypt konczy sie tutaj
# (set -e), stary kontener NIGDY nie zostaje ruszony, strona dalej dziala normalnie.
docker build -t aiwebsites-webapp:latest ./webapp

echo "4) Restartuje kontener..."
docker stop callcenter || true
docker rm callcenter || true
docker run -d --name callcenter --restart unless-stopped \
  -p 3000:3000 \
  -v "$(pwd)/webapp/data:/app/data" \
  -v "$(pwd)/webapp/.env:/app/.env" \
  aiwebsites-webapp:latest

echo "5) Sprawdzam czy nowa wersja faktycznie dziala..."
OK=0
STATUS="?"
CODE="000"
for i in $(seq 1 10); do
  sleep 1
  STATUS=$(docker inspect -f '{{.State.Status}}' callcenter 2>/dev/null || echo "brak")
  if [ "$STATUS" != "running" ]; then
    continue
  fi
  CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  CODE="${CODE:-000}"
  if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then
    OK=1
    break
  fi
done

if [ "$OK" -ne 1 ]; then
  echo ""
  echo "!!! Nowa wersja NIE odpowiada poprawnie (status: $STATUS, http: $CODE)."
  echo "!!! Automatycznie cofam do poprzedniej dzialajacej wersji..."
  docker stop callcenter || true
  docker rm callcenter || true
  docker run -d --name callcenter --restart unless-stopped \
    -p 3000:3000 \
    -v "$(pwd)/webapp/data:/app/data" \
    -v "$(pwd)/webapp/.env:/app/.env" \
    aiwebsites-webapp:previous
  echo "Cofnieto do poprzedniej wersji - strona znow dziala."
  echo "Kod w gicie zostal jak jest (ten zepsuty) - trzeba go osobno naprawic/cofnac."
  echo "Zobacz co bylo nie tak: docker logs callcenter --tail 50"
  exit 1
fi

echo ""
echo "Gotowe - callcenter zaktualizowany, zrestartowany i sprawdzony (HTTP $CODE)."
echo "Jesli mimo to cos jest nie tak: ./rollback.sh cofa recznie do poprzedniej wersji."
