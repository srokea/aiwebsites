# Cold Call Tracker — API dla Jarvisa

Backend: Node/Express + SQLite, żywa baza (leady prawdziwych klientów Sylwestra i Nikodema).
Wszystko poniżej jest już zbudowane i przetestowane, **read-only** na razie (zapis dojdzie później,
przez ten sam klucz — nie zakładaj go, dopóki nie powiemy inaczej).

## Auth

Każdy request:
```
Authorization: Bearer <CALLCENTER_API_KEY>
```
Klucz generuje się ręcznie na maszynie z żywą bazą:
```
node server/scripts/createApiKey.js jarvis --label "Jarvis - terminal assistant"
```
(rola konta = `bot` — pełny odczyt, ale nie pojawia się jako "caller" w reszcie appki).
Brak/zły klucz → `401 {"error":"Niezalogowany"}`.

## Base URL
Lokalnie: `http://localhost:3000`. Produkcyjnie: przez Cloudflare Tunnel Sylwestra (domena do
uzupełnienia, gdy będzie znana).

## Endpointy

### `GET /api/jarvis/calls?status=&next_followup_before=YYYY-MM-DD`
Płaska lista WSZYSTKICH leadów ze wszystkich nisz.
```json
{
  "id": 1134, "client": "GRANDA BARBER SHOP", "phone": "793504224", "caller": "Nikodem",
  "niche": "💈Fryzjerzy", "niche_slug": "s",
  "status": "dopiete", "status_label": "Dopięte",
  "last_contact": "2026-08-01", "next_followup": "2026-08-05",
  "notes": "WE WTOREK ISC OSOBISCIE"
}
```
`status` to jedna z wartości niżej (sekcja "Statusy"). `next_followup` = wcześniejsza z dwóch dat
(oddzwonienie / Google Meet). `notes` = najnowsza notatka (nie cała historia).

### `GET /api/jarvis/upcoming?type=meet|callback|sms|closing|mail`
Nadchodzące/aktywne pozycje, 5 kategorii (bez filtra `type` = wszystkie naraz):
- `meet` — umówiony Google Meet (`when` = pełna data+godzina `YYYY-MM-DDTHH:mm`), ma dodatkowo
  `site_progress` (0-3) i `site_progress_label` ("Wcale"/"W połowie"/"Prawie skończona"/"Skończona") —
  **użyj tego do wykrywania "Meet blisko, a strona wciąż na 0%"**, próg oceniasz sam po dacie.
- `callback` — do oddzwonienia (`when` = data)
- `sms` — Meety JUTRO, czyli komu trzeba wysłać SMS przypominający
- `closing` — leady w etapie "Closing" (po Meecie, przed podpisem); `when` to data ostatniej zmiany,
  nie termin — czytaj jako "ile dni bez ruchu"
- `mail` — leady ze statusem "Mail"; `when` tak samo jak przy `closing`

```json
{ "type": "meet", "id": 1096, "client": "O!HAIR", "phone": "576137881", "caller": "Nikodem",
  "niche": "💈Fryzjerzy", "niche_slug": "s", "when": "2026-08-03T12:00",
  "site_progress": 0, "site_progress_label": "Wcale" }
```

### `GET /api/jarvis/todo?niche=<slug>`
Leady "do zrobienia" (jeszcze niezadzwonione, liczą się do statystyk) — pełne info + telefon.
Bez `niche` = wszystkie nisze naraz. Ta sama definicja "do zrobienia" co dashboard (bez własnej
strony, jakość ≠ 0, `called_at IS NULL`) — liczby 1:1 z tym co widać na stronie.
```json
{ "id": 691, "client": "Kosmetologia...", "phone": "669766469", "city": "Bełchatów",
  "niche": "💅Kosmetyczki", "niche_slug": "kosmetyczki", "status": "nieruszone",
  "status_label": "Nieruszone", "quality": "4", "open_time": null, "close_time": null,
  "callback_when": null, "google_term": null, "notes": "" }
```

### `GET /api/stats` (już istniejący endpoint appki, działa też z kluczem API)
Zbiorcze liczby: `total`, `called`, `todo`, `calledToday`, `dailyGoal`, `interestedBreakdown`
(rozkład statusów), `byCaller` (zadzwonione per osoba), `revenue` (kasa: klienci, jednorazowo,
miesięcznie, netto).

### `GET /api/stats/caller/<display_name>` (np. `/api/stats/caller/Nikodem`)
Głębokie statystyki jednej osoby: `called`, `calledToday`, `calledWeek`, `answered`, `clients`,
`earned`, `meetsAhead`, `interestedBreakdown`, `byNiche`.

### `GET /api/niches`
Lista nisz z `total`/`eligible`/`called` per nisza (do "ile zadzwonionych per nisza").

## Statusy (`status` / `interested`)
`nieruszone` (nowy, nietknięty) · `brak_wlasciciela` · `nie` (odrzucony) · `strona` (ma już stronę) ·
`zamkniete` (tymczasowo zamknięte) · `oczekiwanie` · `my_dzwonimy` ("Poczta") · `sms` ·
`mail` · `google_meet` · `closing` · `dopiete` (wygrany klient)

⚠️ `dopiete` i `zamkniete` to przeciwne wyniki — nie mylić.

## Niepewność do potwierdzenia z Sylwestrem
Rozdzielone "oddzwonić" i "poczta" jako dwie osobne kategorie w `/upcoming` (`callback` vs `mail`),
przy założeniu że to dwie różne rzeczy, nie jedna. Jeśli to błędne założenie — do poprawki.
