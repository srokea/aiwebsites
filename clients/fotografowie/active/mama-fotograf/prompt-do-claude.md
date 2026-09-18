# Prompt: Mama Fotograf — Magda Suszka-Krawiec Photography

## Klon istniejącego szablonu

Skopiuj `/clients/fotografowie/template` **1:1** — całą strukturę, layout, logikę panelu do samodzielnego zarządzania zdjęciami przez fotografa, system kolorów i typografii. **Nie projektuj niczego od nowa.** Docelowy folder klienta: `/clients/fotografowie/active/mama-fotograf/`. Jedyna praca to podmiana treści zgodnie z `brief.md`:

- Nazwa/branding → Mama Fotograf / Magda Suszka-Krawiec Photography
- Logo → `photos/logo.jpg` (transparentne, czarna kreska — osadzić zgodnie z tym, jak referencyjny szablon obsługuje logo, np. jako SVG/PNG na tle zdefiniowanym przez szablon)
- Dane kontaktowe, obszar dojazdu, zdjęcia portretowe, opinie Google (przepisz dosłownie, nie parafrazuj) — wszystko z brief.md
- Sekcje bez danych (o niej, cennik, godziny) — zostaw jako placeholdery w stylu zgodnym z szablonem referencyjnym, nie wymyślaj treści

## Jeśli szablon referencyjny zakłada zdjęcia portfolio/wnętrza, których tu brak

Nie improwizuj zdjęć przykładowych sesji ani wnętrza studia — Magda ich nie dostarczyła. Zostaw te miejsca jako oznaczone placeholdery (zgodnie ze stylem placeholderów w szablonie, np. dashed tiles), użytkownik uzupełni później.

## Obszar dojazdu — wyeksponować

Piotrków Trybunalski, Bełchatów, Tomaszów Mazowiecki, Sulejów, Opoczno — to realny wyróżnik (podobnie jak mobilna obsługa u innych klientek), nie chować w stopce.

## Godziny

Zwykła tabela godzin z brief.md (Wt–Pt 09:00–16:00, Pon/Sob/Nd zamknięte) — stały harmonogram, nie framing "sesje na umówiony termin".

## Panel dla fotografa

Cała logika (upload/zarządzanie zdjęciami przez Magdę) pochodzi z szablonu referencyjnego — skopiuj mechanizm bez zmian, tylko podłącz pod dane/branding tego klienta.

## Screenshot

`node scripts/screenshot.mjs clients/fotografowie/active/mama-fotograf`
