# Galeria — zdjęcia prac

9 zdjęć klientki skonwertowane do `gal-01.webp`…`gal-09.webp`. Oryginalne pliki `*-booksy.jpeg`
zostają w tym folderze jako archiwum źródłowe (nieużywane bezpośrednio na stronie).

**Widok główny pokazuje tylko 6 kafli** (`gal-01`…`gal-06`, wzorem `clients/Patent-na-Pazur`) —
to świadomy limit z briefu, nie wszystkie zdjęcia mają zaśmiecać sekcję. Pozostałe 3 (`gal-07`…`gal-09`)
są nadal w tablicy `GALERIA` w `<script>` na dole strony i dostępne w lightboxie strzałkami
next/prev po otwarciu któregokolwiek widocznego kafla — patrz komentarz w `index.html` nad `</ul>`
sekcji `#galeria`.

## Jak dodać kolejne zdjęcie do WIDOKU GŁÓWNEGO

Jeśli 6 widocznych kafli ma się zmienić (np. podmiana starszej pracy na nowszą), dodaj/zamień `<li>`
w sekcji `#galeria`, każdy kafel to:

```html
<li class="text-center">
  <button type="button" data-index="N" class="vignette gallery-tile block w-full cursor-zoom-in">
    <svg class="vignette-ring" viewBox="0 0 200 200" fill="none" aria-hidden="true">...</svg>
    <span class="vignette-inner">
      <img src="photos/galeria/gal-10.webp" alt="Krótki opis stylizacji" loading="lazy" class="transition duration-300 hover:scale-105">
    </span>
  </button>
  <p class="mt-3 text-[.9rem] font-medium leading-snug sm:text-[.95rem]">Etykieta</p>
</li>
```

`data-index` musi być kolejną liczbą (0-indeksowaną) i musi mieć odpowiednik w tablicy `GALERIA` w
`<script>` na dole strony (ten sam `src`/`alt`) — to z niej lightbox bierze zdjęcie do powiększenia.

## Zasady

- **Kadr kwadratowy.** Winieta jest okrągła (własna technika klientki, powtarzana na jej plakatach),
  więc zdjęcie przycinamy do kwadratu, zanim tu trafi. Dłonie/paznokcie mają być na środku kadru,
  inaczej `object-fit: cover` utnie je przy krawędzi koła.
- **Lightbox pokazuje pełne zdjęcie.** Kafel jest przycięty do koła tylko wizualnie (CSS) — lightbox
  po kliknięciu pokazuje cały, nieprzycięty obrazek z tablicy `GALERIA`.
- **Sprawdź na mobile.** Na telefonie kafle są w dwóch kolumnach (~165 px). Detale zdobień muszą być
  czytelne w tym rozmiarze.
- Format `.webp`, dłuższy bok max 1100 px.
- Każdy `alt` opisuje konkretną stylizację, nie "zdjęcie 1".

Po dodaniu zdjęć: `node scripts/screenshot.mjs clients/Juliett-Beauty-Room` i obejrzeć kadry
na wersji mobilnej ORAZ desktopowej.
