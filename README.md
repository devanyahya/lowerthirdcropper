# Lower Third Cropper

Aplikasi web untuk membuat crop **lower third** berbentuk kotak dengan **sudut membulat yang bisa diatur** (struktur tetap kotak), lalu mengekspornya sebagai **PNG transparan**.

Semua proses berjalan di browser — gambar tidak dikirim ke server.

## Fitur

- Upload gambar background
- 6 preset posisi (bar bawah, lower third, kiri/kanan bawah, lebar penuh, tengah)
- Geser & ubah ukuran kotak lewat 8 titik (4 sudut + 4 tengah sisi)
- Slider **lengkung sudut** (rounded corner) tanpa mengubah bentuk kotak
- Pilih sudut mana saja yang dibulatkan (TL / TR / BR / BL)
- Grid bantu (rule of thirds)
- Simpan & load bentuk (disimpan di browser via localStorage)
- Export PNG transparan pada resolusi asli gambar

## Jalankan dengan Docker

Aplikasi di-bind ke `127.0.0.1:3350` di host, meneruskan ke port `3000` di dalam container.

```bash
# build & jalankan
docker compose up -d --build

# cek log
docker compose logs -f

# hentikan
docker compose down
```

Setelah jalan, akses dari server di `http://127.0.0.1:3350`.

> Karena di-bind ke `127.0.0.1`, aplikasi hanya bisa diakses dari dalam server.
> Untuk akses dari luar, taruh di belakang reverse proxy (mis. Nginx / Caddy) yang
> meneruskan ke `127.0.0.1:3350`.

### Contoh blok Nginx

```nginx
location / {
    proxy_pass http://127.0.0.1:3350;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## Alur deploy yang kamu pakai

```bash
# di lokal: push ke GitHub
git init
git add .
git commit -m "lower third cropper"
git remote add origin <repo-kamu>
git push -u origin main

# di server:
git pull
docker compose up -d --build
```

## Tanpa Docker (opsional)

Butuh Node.js 18+.

```bash
npm start
# buka http://localhost:3000
```
