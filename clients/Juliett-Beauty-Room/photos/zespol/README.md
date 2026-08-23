# Zespół — miejsce na zdjęcia

Tu wrzucamy portretowe zdjęcia trzech osób z zespołu: Julita (założycielka), Zuza (paznokcie i brwi), Klaudia (paznokcie).

## Jak podmienić placeholder na zdjęcie

W `index.html`, w sekcji `#zespol`, każda osoba ma taki blok:

```html
<div class="vignette-inner vignette-empty">
  <svg ...osoba-ikona.../>
</div>
```

Podmieniamy zawartość na obrazek i usuwamy klasę `vignette-empty`:

```html
<div class="vignette-inner">
  <img src="photos/zespol/julita.webp" alt="Julita, założycielka salonu" loading="lazy">
</div>
```

## Zasady

- **Kadr kwadratowy, twarz na środku.** Winieta jest okrągła — jeśli zdjęcie jest pionowe/poziome i twarz nie jest wycentrowana, `object-fit: cover` ją utnie. Przytnij do kwadratu przed wstawieniem.
- Portretowe, dobrze oświetlone ujęcia (twarz wyraźnie widoczna) — nie zdjęcia w ruchu ani z dużym kadrem otoczenia.
- Format `.webp`, dłuższy bok max 800 px.
- Po dodaniu zdjęć: `node scripts/screenshot.mjs clients/Juliett-Beauty-Room` i sprawdzić kadry na mobile i desktop.
