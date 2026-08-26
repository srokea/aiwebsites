# Zdjęcia do galerii

Tu wrzucamy zdjęcia efektów od Kingi. Sześć kafli na stronie czeka na:

| Kafel | Co ma być | Nazwa pliku |
|---|---|---|
| 1 | rzęsy | `rzesy-1.jpg` |
| 2 | rzęsy | `rzesy-2.jpg` |
| 3 | brwi (henna pudrowa) | `brwi-1.jpg` |
| 4 | brwi (henna pudrowa) | `brwi-2.jpg` |
| 5 | paznokcie | `paznokcie-1.jpg` |
| 6 | paznokcie | `paznokcie-2.jpg` |

Kafle są kwadratowe (`aspect-square`, `object-fit: cover`), więc po wstawieniu
zdjęć trzeba sprawdzić kadry na mobile i desktop i w razie czego dobrać
`object-position`. Zdjęcia pionowe przycinają się najmocniej.

Docelowo: dłuższy bok około 1200 px, JPG.

## Podpięcie do lightboxa

Kafle w sekcji Galeria już otwierają lightbox (klik, strzałki, klawiatura,
swipe na mobile) — na razie pokazuje tylko powiększony placeholder z etykietą,
bo nie ma jeszcze prawdziwych zdjęć. Gdy zdjęcia trafią do tego folderu:

1. W `index.html` w tablicy `GALERIA` (w `<script>` na końcu pliku) zamień
   `{ label: 'Zdjęcie rzęs' }` na `{ src: 'photos/galeria/rzesy-1.jpg', alt: '...' }`
   dla wszystkich sześciu wpisów.
2. W funkcji `render()` tej samej sekcji podmień
   `label.textContent = GALERIA[current].label;`
   na ustawienie obrazka we `#lightboxFrame` (np. `<img>` zamiast `<span id="lightboxLabel">`).
3. Same kafle w markupie (`<button class="gallery-tile" ...>`) zamień z placeholderów
   na `<img>` 1:1, tak jak zrobiono to w Patent-na-Pazur/index.html — reszta zdarzeń
   (klik, klawiatura, swipe, focus) zostaje bez zmian.
