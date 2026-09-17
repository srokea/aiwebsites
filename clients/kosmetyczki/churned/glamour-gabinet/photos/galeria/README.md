# Galeria — zdjęcia efektów zabiegów

Folder gotowy na zdjęcia efektów zabiegów od klientki (Glamour, Przedbórz).

Jak dodać zdjęcie do galerii na stronie:

1. Wrzuć plik tutaj, np. `gal-01.webp` (najlepiej kwadrat, min. 800×800 px).
2. W `index.html`, w sekcji `#galeria`, zamień jeden z dashed-placeholderów
   (`<div class="slot-box ...">`) na kafel `<button class="gallery-tile ...">`
   skopiowany z sąsiedniego, istniejącego kafla.
3. Ustaw w nim kolejny wolny `data-index`.
4. Dopisz zdjęcie na końcu tablicy `GALERIA` w skrypcie na dole `index.html`
   — kolejność w tablicy MUSI odpowiadać wartościom `data-index`.
