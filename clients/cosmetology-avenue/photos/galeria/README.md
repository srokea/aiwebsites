# Galeria efektów zabiegów

Sekcja „Galeria” w `index.html` ma 6 kafli w siatce 3×2:

- **Pierwsze 3** — miejsce na porównania przed/po z suwakiem. Na razie oznaczone
  jako puste (dashed + etykieta „Przed / Po”), świadomie nie udają gotowego efektu.
- **Ostatnie 3** — prawdziwe zdjęcia: `produkty-vagheggi.jpg`, `produkty-lpg.jpg`,
  `salon-zabieg.jpg`.

## Jak podłączyć suwak przed/po, gdy klientka przyśle pary zdjęć

Dla każdej pary (przed.jpg + po.jpg) zamień jeden dashed-kafel na:

```html
<div class="ba-slider relative aspect-square overflow-hidden border border-hairline" data-ba-slider>
  <img src="photos/galeria/PO.jpg" alt="Efekt po zabiegu" class="absolute inset-0 h-full w-full object-cover" draggable="false">
  <div class="ba-clip absolute inset-0 overflow-hidden" style="width:50%">
    <img src="photos/galeria/PRZED.jpg" alt="Stan przed zabiegiem" class="ba-clip-img absolute inset-0 h-full object-cover" draggable="false">
  </div>
  <div class="ba-handle absolute inset-y-0" style="left:50%" aria-hidden="true"></div>
  <input type="range" min="0" max="100" value="50" class="ba-range absolute inset-0 h-full w-full cursor-ew-resize opacity-0" aria-label="Suwak porównania przed i po">
  <span class="ba-label left-2">Przed</span>
  <span class="ba-label right-2">Po</span>
</div>
```

Potrzebne fragmenty CSS/JS (dopisać przy pierwszym uzyciu, nie trzymac martwego
kodu w kodzie zanim beda prawdziwe zdjecia):

```css
.ba-clip-img { width: var(--ba-w, 100vw); max-width: none; }
.ba-handle { width: 2px; background: #7C6633; pointer-events: none; }
.ba-handle::after { content: ""; position: absolute; top: 50%; left: 50%; width: 34px; height: 34px;
  transform: translate(-50%, -50%); border-radius: 9999px; background: #7C6633; }
.ba-label { position: absolute; bottom: 0.5rem; font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase;
  color: #F7F3ED; background: rgba(33,29,25,0.55); padding: 0.2rem 0.5rem; border-radius: 9999px; }
```

```js
document.querySelectorAll('[data-ba-slider]').forEach(function (el) {
  var range = el.querySelector('.ba-range');
  var clip = el.querySelector('.ba-clip');
  var handle = el.querySelector('.ba-handle');
  var img = el.querySelector('.ba-clip-img');
  function set(v) {
    clip.style.width = v + '%';
    handle.style.left = v + '%';
    img.style.setProperty('--ba-w', el.clientWidth + 'px');
  }
  range.addEventListener('input', function () { set(range.value); });
  window.addEventListener('resize', function () { set(range.value); });
  set(range.value);
});
```

Suwak to natywny `<input type="range">` (przezroczysty, na calej powierzchni kafla) —
dziala z klawiatury i na dotyku bez dodatkowej logiki przeciagania.

Kadr wszystkich zdjęć w tej sekcji: kwadrat (`aspect-square`), `object-fit: cover`.
Po dodaniu nowych zdjęć zrób zrzuty (`node scripts/screenshot.mjs clients/cosmetology-avenue`)
i sprawdź kadrowanie na mobile i desktopie — najczęstszy błąd to ucięta twarz/fragment
zdjęcia przez `object-fit: cover`.
