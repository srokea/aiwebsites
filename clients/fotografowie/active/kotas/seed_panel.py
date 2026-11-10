"""
Jednorazowe wgranie zdjęć z FB (photos/sesje/) do panelu Pauliny, żeby od
pierwszego dnia całe portfolio było w panelu i dało się nim zarządzać.

Robi to samo co panel przy ręcznym wgrywaniu: skaluje do max 2000 px
dłuższego boku, zapisuje jako WebP (jakość 85), pionowe zdjęcia dostają
wyższy kafel (portrait=1). Kolejność i podział na kategorie są takie same
jak w zapasie strony (public/assets/js/site.js → LOCAL_SETS).

Kategoria, w której są już zdjęcia, jest pomijana (można puścić drugi raz).
Brakujące kategorie zakłada sam.

Użycie (z folderu klienta):
  python seed_panel.py --api https://portfolio-kotas.project6osss.workers.dev --password HASLO
  python seed_panel.py --api http://127.0.0.1:8787 --password haslo-do-testow     # lokalnie
"""
import argparse
import io
import json
import os
import sys
import urllib.request
import uuid

from PIL import Image, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'photos')

# Numery plików wg posortowanej listy photos/ (jak przy budowie strony).
CATEGORIES = [
    ('Kobiece',     'Sesja kobieca',     [13, 8, 4, 10, 12, 7, 5, 9, 14, 6, 11, 15]),
    ('Ciążowe',     'Sesja ciążowa',     [3, 1, 2]),
    ('Noworodkowe', 'Sesja noworodkowa', [21, 19, 16, 20, 18, 22, 17]),
    ('Rodzinne',    'Sesja rodzinna',    [27, 23, 28, 31, 24, 33, 26, 30]),
    ('Dziecięce',   'Sesja dziecięca',   [34, 25, 29, 32]),
    ('Reportaże',   'Reportaż',          []),
]
MAX_SIDE = 2000
QUALITY = 85


def files_sorted():
    out = []
    for d, _, fs in os.walk(SRC):
        for f in sorted(fs):
            out.append(os.path.join(d, f))
    out.sort()
    return out


def call(api, path, method='GET', body=None, token=None, raw=None, ctype='application/json'):
    data = raw if raw is not None else (json.dumps(body).encode('utf-8') if body is not None else None)
    headers = {'Content-Type': ctype}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    req = urllib.request.Request(api + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as res:
        payload = json.load(res)
    if not payload.get('ok'):
        raise RuntimeError(payload.get('error') or 'Błąd API')
    return payload['data']


def to_webp(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    scale = min(1, MAX_SIDE / max(im.size))
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=QUALITY, method=6)
    return buf.getvalue(), im.height > im.width * 1.1


def multipart(fields, file_bytes, filename):
    boundary = uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode('utf-8'))
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: image/webp\r\n\r\n'.encode('utf-8'))
    parts.append(file_bytes)
    parts.append(f'\r\n--{boundary}--\r\n'.encode('utf-8'))
    return b''.join(parts), 'multipart/form-data; boundary=' + boundary


def plural(n):
    if n == 1:
        return '1 zdjęcie'
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return f'{n} zdjęcia'
    return f'{n} zdjęć'


def main():
    # konsola Windows (cp1250) nie ma znaków typu ✓ i polskich liter w każdej stronie kodowej
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    ap = argparse.ArgumentParser()
    ap.add_argument('--api', required=True, help='adres workera, bez / na końcu')
    ap.add_argument('--password', required=True, help='hasło do panelu (ADMIN_PASSWORD)')
    args = ap.parse_args()
    api = args.api.rstrip('/')

    token = call(api, '/api/auth', 'POST', {'password': args.password})['token']
    files = files_sorted()
    folders = call(api, '/api/folders')

    for name, alt, numbers in CATEGORIES:
        folder = next((f for f in folders if f['name'] == name), None)
        if not folder:
            folder = call(api, '/api/folders', 'POST', {'name': name}, token)
            folders.append(folder)
            print(f'+ kategoria {name}')
        albums = call(api, f"/api/folders/{folder['id']}/content")
        if not albums:
            albums = [call(api, '/api/albums', 'POST', {'folderId': folder['id']}, token)]
        if any(a.get('items') for a in albums):
            print(f'= {name}: są już zdjęcia, pomijam')
            continue
        album_id = albums[0]['id']
        for n, idx in enumerate(numbers, 1):
            data, portrait = to_webp(files[idx])
            fields = {'albumId': album_id}
            if portrait:
                fields['portrait'] = '1'
            body, ctype = multipart(fields, data, f'{name.lower()}-{n:02d}.webp')
            item = call(api, '/api/items/upload', 'POST', token=token, raw=body, ctype=ctype)
            call(api, f"/api/items/{item['id']}", 'PUT', {'display_name': f'{alt}, zdjęcie {n}'}, token)
            print(f'  {name} {n}/{len(numbers)}  {len(data) // 1024} KB')
        if not numbers:
            print(f'- {name}: brak zdjęć do wgrania')
            continue
        print(f'✓ {name}: {plural(len(numbers))}')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # noqa: BLE001 - komunikat dla człowieka
        print('Błąd:', e, file=sys.stderr)
        sys.exit(1)
