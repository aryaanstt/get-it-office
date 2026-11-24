# get it office

Kantor tim AI Arya yang realtime: siapa lagi ngerjain apa, kabar terbaru, dan keputusan yang nunggu bos.
Rencana alamat: https://aryaanstt.github.io/get-it-office/

## Isi
- `index.html`, `app.css`, `app.js`: situs statis, tanpa build.
- `manifest.json`, `favicon.svg`, `apple-touch-icon.png`, `ikon-192.png`, `ikon-512.png`: biar bisa ditambah ke layar utama iPhone.

## Tampilan
- **Kantor** (utama): denah 9 ruangan. Karakter duduk di ruangan sesuai kolom `ruang`, jalan ke Ruang Manajer pas statusnya jadi `beres`, nyamperin meja orang yang disebut di kabar, gelembung omongan dari kabar baru.
- **Grup chat**: kabar per kanal, plus kanal `meja-bos` (keputusan dan pesan lu) di mode bos.

## Data (Supabase, project yang sama dengan Get a Job)
- Mode tamu: view `office_tim_publik` dan `office_kabar_publik`. Cuma liat.
- Mode bos (login akun get it, sesi `gio-auth`): `office_tim`, `office_kabar`, `office_keputusan` (jawab = update `jawaban`, `catatan_jawaban`, `dijawab`), `office_pesan` (insert `untuk`, `teks` dari chat, Colek, Panggil).
- Ditarik tiap 12 detik selama tab kebuka. Status: `diam | jalan | nunggu | beres | gagal`.

## Tes lokal
Preview `get-it-office` di `Downloads\.claude\launch.json` (port 8880).
- `http://localhost:8880/` pakai data asli (mode tamu kalau belum login).
- `http://localhost:8880/?demo=tamu` atau `?demo=bos`: data tiruan yang gerak sendiri, ga nyentuh server. Cuma aktif di localhost.
