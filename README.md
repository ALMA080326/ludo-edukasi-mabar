# Jalur Pikir — Game Trivia Kelompok (1 Host + Banyak Client)

Game papan trivia real-time: 1 layar host (proyektor/laptop) menampilkan papan
dan soal, sedangkan tiap kelompok menjawab dari HP masing-masing. Jawaban
cepat & tepat = langkah lebih jauh di papan. Mendukung hingga 8 kelompok,
jadi 40 siswa bisa dibagi ±5 orang/kelompok dan semua tetap ikut menjawab.

## Menjalankan di komputer sendiri (uji coba)

```bash
npm install
npm start
```

Lalu buka:
- Host (di laptop/proyektor): `http://localhost:3000/host.html`
- Pemain (di tiap HP): `http://localhost:3000/client.html`

**Penting:** supaya HP siswa bisa connect, semua device harus di **WiFi yang
sama**, dan pemain membuka alamat IP komputer kamu, bukan `localhost`.
Contoh: `http://192.168.1.10:3000/client.html`. Cek IP lokal komputer kamu
dengan `ipconfig` (Windows) atau `ifconfig`/`ip a` (Mac/Linux).

## Deploy online (disarankan untuk 40 device, biar tidak bergantung WiFi lokal)

Supaya lebih stabil untuk 40 orang dan tidak tergantung WiFi sekolah, deploy
ke hosting gratis seperti **Render** atau **Railway**:

1. Upload folder ini ke repository GitHub baru.
2. Di [render.com](https://render.com), buat **New Web Service**, connect ke
   repo tsb.
3. Build command: `npm install` — Start command: `npm start`.
4. Setelah deploy selesai, kamu dapat URL publik, misalnya
   `https://jalur-pikir.onrender.com`.
5. Host buka `https://jalur-pikir.onrender.com/host.html`.
6. Pemain buka `https://jalur-pikir.onrender.com/client.html` (atau kamu bisa
   generate QR code dari URL ini biar siswa tinggal scan).

## Struktur proyek

```
ludo-game/
├── server.js         # Logic room, giliran, skor (Socket.io)
├── questions.json     # Bank soal — edit/tambah sendiri di sini
├── package.json
└── public/
    ├── host.html       # Layar utama: papan, skor, tombol mulai soal
    └── client.html      # Layar pemain: join, jawab soal
```

## Cara pakai saat main

1. Host buka `host.html`, pilih jumlah kelompok, klik **Buat Room** → muncul
   kode 4 digit.
2. Siswa buka `client.html`, masukkan kode room, nama, pilih kelompok.
3. Host klik **⚡ Mulai Soal** → soal muncul di layar host dan HP kelompok
   yang sedang giliran (kelompok lain melihat status menunggu).
4. Siapa pun di kelompok itu boleh tap jawaban duluan — kecepatan & ketepatan
   menentukan jumlah langkah (lihat tabel di `server.js`, fungsi
   `stepsForTime`).
5. Giliran otomatis pindah ke kelompok berikutnya. Kelompok pertama yang
   sampai FINISH jadi juara.

## Yang bisa dikembangkan lebih lanjut

- Tambah soal di `questions.json` (format: `text`, `options`, `correctIndex`).
- Tambah suara benar/salah (taruh file audio di `public/`, mainkan via JS).
- Tambah fitur "Soal Rebutan" untuk tie-break di akhir permainan.
- Tambah reconnect otomatis kalau HP siswa sempat terputus WiFi.
