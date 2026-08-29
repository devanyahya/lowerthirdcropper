const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Penanda versi aset, diambil dari waktu ubah app.js saat server menyala.
// Container dibangun ulang tiap deploy, jadi penandanya ikut berganti sendiri
// tanpa perlu diketik manual. Ini yang membuat Cloudflare mengambil berkas
// baru: alamatnya berubah, bukan cache-nya yang ditunggu kedaluwarsa.
let BUILD = 'dev';
try {
  BUILD = String(fs.statSync(path.join(PUBLIC_DIR, 'app.js')).mtimeMs | 0);
} catch (e) { /* biarkan 'dev' kalau berkasnya belum ada */ }

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // prevent path traversal
  const safePath = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(safePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(safePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };

    if (ext === '.html') {
      // HTML tidak boleh di-cache: di sinilah penanda versi aset ditulis,
      // jadi berkas inilah yang harus selalu segar.
      headers['Cache-Control'] = 'no-cache, must-revalidate';
      data = Buffer.from(String(data).replace(/__V__/g, BUILD), 'utf-8');
      headers['Content-Length'] = data.length;
    } else {
      // Aset dipanggil dengan ?v=<penanda>, jadi aman disimpan lama.
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    }

    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Lower Third Cropper running on port ${PORT}`);
});
