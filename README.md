# DnD App

Aplikasi D&D 5e self-hosted: lembar karakter, kompendium SRD, dan virtual tabletop (VTT).

## Struktur

```
dnd-app/
├─ packages/
│  ├─ contracts/   Skema Zod untuk REST API + event Socket.IO (dipakai web & server)
│  ├─ rules/       Logika D&D murni (modifier, proficiency, dadu) + unit test
│  ├─ character/   Build karakter → stat turunan + validasi builder (dipakai web & server)
│  └─ data/        Data SRD (JSON) yang divalidasi dengan Zod
├─ apps/
│  ├─ server/      Fastify + Socket.IO + PostgreSQL, juga menyajikan build web di production
│  └─ web/         React + PixiJS (Vite)
├─ docs/PLAN.md         Rencana fitur dan skema database
├─ docker-compose.yml   Opsional: Postgres via Docker (:5433), + profile "app" untuk versi production
└─ Dockerfile           Satu image: server + build web
```

Paket di `packages/` diekspor sebagai source TypeScript (tanpa build step).
Vite dan tsx langsung membacanya, dan `tsup` mem-bundle-nya ke build server.

Rencana fitur, skema database, dan urutan pengerjaan ada di [docs/PLAN.md](docs/PLAN.md).
Acuan aturan: **SRD 5.2.1** (aturan 2024).

## Mulai

Butuh Node 24+ (`.nvmrc`), pnpm 10, dan PostgreSQL 16+ yang terpasang di komputer sendiri.

### 1. Siapkan role Postgres (sekali saja)

```bash
sudo -u postgres createuser --createdb --pwprompt $USER   # isi password
```

`--createdb` dibutuhkan karena `pnpm db:setup` membuat database `dnd` dan `dnd_test` sendiri.

### 2. Isi `.env`

```bash
pnpm install
cp .env.example .env
```

Ubah `DATABASE_URL` di `.env` sesuai user dan password kamu:

```
DATABASE_URL="postgres://<user>:<password>@localhost:5432/dnd"
```

Karakter khusus di password harus di-URL-encode, karena `postgres://` adalah URL.
Contoh: password `#Rahasia` ditulis `%23Rahasia`.

| Karakter | Tulis sebagai |
| -------- | ------------- |
| `#`      | `%23`         |
| `@`      | `%40`         |
| `:`      | `%3A`         |
| `/`      | `%2F`         |
| `?`      | `%3F`         |
| `%`      | `%25`         |

### 3. Siapkan database dan jalankan

```bash
pnpm db:setup             # buat database → migrasi → data contoh
pnpm dev                  # server :4000 + web :5173
```

Buka http://localhost:5173, pilih salah satu user di **Dev login**, lalu buka "Dev Campaign".
Coba login sebagai user lain di jendela private: geser token atau lempar dadu, dan jendela
lain ikut berubah.

Cek koneksi database kapan saja di http://localhost:5173/api/health (`"db": "up"`).

## Login

- **Dev login** (`DEV_LOGIN=true` di `.env`): login sebagai user seed tanpa kredensial apa pun.
  Hanya aktif saat development; diabaikan bila `NODE_ENV=production`.
- **Google**: buat OAuth client ID (tipe _Web application_) di Google Cloud Console, isi
  _Authorized redirect URI_ dengan `<PUBLIC_URL>/api/auth/google/callback`
  (development: `http://localhost:5173/api/auth/google/callback`), lalu isi
  `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` di `.env`. Tombol Google muncul otomatis.

Session disimpan di cookie httpOnly; tabel `sessions` hanya menyimpan hash token-nya.

## Halaman promosi campaign

| URL       | Isi                                              | Login       |
| --------- | ------------------------------------------------ | ----------- |
| `/`       | Promosi Serpih Langit: peta, pulau awal, faksi   | Tidak       |
| `/daftar` | Form registrasi dengan upload character sheet    | Ya          |
| `/dm`     | Pilih era peta, tinjau dan terima para pendaftar | Ya, GM saja |
| `/app`    | VTT, karakter, dan kompendium                    | Ya          |

- `PROMO_CAMPAIGN_ID` menentukan campaign yang dipromosikan. Di development pakai campaign seed
  (lihat `.env.example`). Di production, buat campaign di `/app` sebagai DM, lalu isi id-nya.
- Teks tiap era ada di `apps/server/src/promo/world.ts` dan hanya dikirim untuk era yang sedang
  aktif. Jangan menaruh rahasia DM di sana, atau konten era di `apps/web`.
- Character sheet (`sheets/`) dan gambar peta (`map/`) disimpan di bucket MinIO privat. Browser
  tidak pernah mengakses MinIO langsung: server memeriksa login, role, dan era dulu, baru
  mengalirkan isi filenya. Gambar peta tidak ada di git.

Co-DM adalah anggota campaign dengan role `gm`, jadi haknya sama dengan DM di `/dm` dan di meja.
Hanya pemilik campaign (`campaigns.owner_id`) yang bisa mengundang dan mencabut. Undangan dibuat
di `/dm`: link sekali pakai yang terikat ke satu email Google dan berlaku 7 hari. Database hanya
menyimpan hash tokennya, jadi link tidak bisa ditampilkan ulang.

Catatan campaign ada di `/dm/catatan`: catatan bersama DM dan co-DM, per pulau dan per nomor sesi.
Pemain tidak bisa membukanya. Dua DM yang mengubah catatan yang sama tidak saling menimpa: yang
menyimpan belakangan mendapat peringatan dan tulisannya tetap ada di form.

Menyiapkan MinIO (sekali saja; pakai kredensial admin MinIO, aplikasi mendapat user sendiri
yang hanya bisa mengakses bucket ini, dan kredensialnya ditulis ke `.env`):

```bash
scripts/minio-setup.sh ~/minio-setup/minio.env
pnpm promo:upload-map          # dari apps/server/promo-assets, atau: pnpm promo:upload-map <folder>
```

Selama `S3_*` kosong, pendaftaran tertutup dan peta tanpa gambar. Test memakai penyimpanan di
memori, jadi `pnpm test` tidak butuh MinIO.

### Production di `dnd.rfp11.com`

Aplikasi dibuka lewat Cloudflare Tunnel. Arahkan _published application_ ke build production,
bukan ke `pnpm dev`: Dev login hanya mati saat `NODE_ENV=production`, dan selama aktif siapa pun
bisa masuk sebagai user seed, termasuk GM.

1. Di Google Cloud Console, tambahkan _Authorized redirect URI_
   `https://dnd.rfp11.com/api/auth/google/callback`.
2. Jalankan dengan `PUBLIC_URL=https://dnd.rfp11.com`, `S3_ENDPOINT=https://s3.rfp11.com`, dan
   `S3_ACCESS_KEY`/`S3_SECRET_KEY` dari `.env`. `PUBLIC_URL` https juga membuat cookie session
   `Secure`.
3. Login dengan Google di `https://dnd.rfp11.com/app`, buat campaign Serpih Langit, lalu isi
   `PROMO_CAMPAIGN_ID` dengan id-nya dan restart.

## Database

| Perintah           | Fungsi                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| `pnpm db:setup`    | `db:create` + `db:migrate` + `db:seed`                                        |
| `pnpm db:create`   | Buat database dari `DATABASE_URL` + database `<nama>_test` untuk test         |
| `pnpm db:migrate`  | Jalankan migrasi Drizzle (database utama dan `_test`)                         |
| `pnpm db:generate` | Buat file migrasi dari perubahan skema; commit bersama PR yang mengubah skema |
| `pnpm db:seed`     | Isi data contoh (aman dijalankan berulang)                                    |
| `pnpm db:reset`    | Hapus dan buat ulang kedua database lalu `db:setup` (ditolak di production)   |
| `pnpm db:studio`   | Buka Drizzle Studio untuk melihat isi tabel                                   |

Data contoh dari seeder (hanya development/test):

- User: `gm@dev.local` (GM), `player1@dev.local`, `player2@dev.local`
- Campaign "Dev Campaign" dengan invite code `DEVCAMP`, ketiga user sebagai anggota
- Beberapa riwayat lemparan dadu
- Karakter: Brunhild (Dwarf Fighter 1), Elaria (Elf Wizard 5), Kara (Tiefling Fighter 2 /
  Warlock 1), Tobin (Human Cleric 5, belum masuk campaign), dan Pip (draft di tengah builder).
  Semuanya dibuat lewat kode builder yang sama dengan aplikasi; seeder gagal bila datanya
  tidak valid.

Seeder bertambah di tiap fase (karakter di Fase 2, scene & token di Fase 3, dst.).

Aturan skema:

- Skema ada di `apps/server/src/db/schema.ts`. Ubah di sana, lalu `pnpm db:generate`.
  Jangan mengedit tabel langsung lewat SQL.
- Server menjalankan migrasi yang belum diterapkan saat start, jadi deploy cukup restart.
- Konten SRD (spell, monster, item) **tidak** disimpan di database; tetap JSON di `packages/data`.
- Test server memakai database `<nama>_test` (dibuat `db:create`); isinya dihapus dan di-seed
  ulang setiap file test berjalan. `pnpm test` butuh Postgres yang menyala.

## Perintah lain

| Perintah                                  | Fungsi                                  |
| ----------------------------------------- | --------------------------------------- |
| `pnpm dev`                                | Jalankan server + web dengan hot reload |
| `pnpm test`                               | Unit test semua paket (Vitest)          |
| `pnpm typecheck`                          | Cek tipe TypeScript                     |
| `pnpm lint` / `pnpm format`               | ESLint / Prettier                       |
| `pnpm build`                              | Build production (`apps/*/dist`)        |
| `docker compose --profile app up --build` | Jalankan versi production di :4000      |

## Pembagian area

| Area         | Folder                                               | Isi                                      |
| ------------ | ---------------------------------------------------- | ---------------------------------------- |
| Rules engine | `packages/rules`                                     | Modifier, AC, spell slot, attack, damage |
| Data SRD     | `packages/data`                                      | Kelas, spell, monster dari SRD 5.2       |
| Karakter     | `packages/character`                                 | Stat turunan, validasi build             |
| Backend      | `apps/server`                                        | Auth, database, campaign, Socket.IO      |
| Frontend UI  | `apps/web/src/features/{character-sheet,compendium}` | Lembar karakter, kompendium, layout      |
| VTT          | `apps/web/src/features/vtt`                          | Peta, grid, token, fog of war            |
| Lead         | `packages/contracts`                                 | Menjaga kontrak API, review PR           |

## Aturan kerja

- `main` dilindungi. Semua perubahan lewat Pull Request dengan minimal 1 review.
- CI (lint, typecheck, test, build) harus hijau sebelum merge.
- Mengubah `packages/contracts`? Update web dan server di PR yang sama.
- Kode di `packages/rules` harus murni (tanpa I/O, randomness di-inject) dan selalu disertai test.
- Satu issue per fitur. Nama branch: `feat/vtt-fog-of-war`, `fix/dice-parser`, dst.

## Peta

DM mengunggah peta di tab Meja (PNG, JPG, atau WebP, maksimal 25 MB dan 8192 piksel per sisi).
Gambarnya disimpan di bucket MinIO (`scenes/`) dan dikirim lewat server, jadi peta yang belum
ditayangkan tidak bisa dilihat pemain.

Skala disimpan sebagai jumlah piksel gambar per kotak grid (`scenes.grid_px`) dan posisi garis
pertamanya (`offset_x`, `offset_y`). Di papan, satu kotak selalu seukuran token Medium, jadi peta
yang diperbesar atau diperkecil mengikuti token, bukan sebaliknya.

Token tersimpan per peta (`tokens`). Hanya DM yang bisa menambah, mengubah, dan menghapus; DM bisa
menggeser semua token, pemain hanya token karakternya sendiri. Server tidak pernah mengirim token
tersembunyi atau HP ke pemain, jadi `tokens:changed` hanya menyuruh client mengambil ulang dan
geseran token tersembunyi hanya dikirim ke room DM (`campaignGmRoom`).

Encounter (`encounters`, `combatants`) satu per campaign dan dihapus saat selesai. Inisiatif
dilempar server dari bonus monster atau karakter. Urutan selalu dihitung dari inisiatif tertinggi;
yang dikirim ke client sudah diputar mulai dari yang sedang giliran, jadi kartu yang selesai
pindah ke bawah. Peserta tersembunyi tidak dikirim ke pemain.

Serangan (`scenes/attacks.ts`) dilempar di server: pilih target, lempar lawan AC, dan damage hanya
bisa dilempar setelah kena (`pending_attacks`, sekali pakai). Damage langsung mengurangi HP target,
memperhitungkan kritis, resistance, immunity, dan concentration. Opportunity attack muncul saat
token keluar dari jangkauan musuh pada gilirannya sendiri (`reaction_prompts`).

Spell karakter ada di `character_spells`: pilihan per class (dibatasi tabel class SRD lewat
`packages/character/src/spells.ts`) dan pemberian species. `POST /characters/:id/cast` memakai slot
terendah yang cocok, atau Pact Magic lebih dulu, dan mengisi concentration.

## Menambah event real-time

1. Tambah skema + tipe di `packages/contracts/src/socket.ts`
2. Tangani di `apps/server/src/plugins/socket.ts` (selalu `safeParse` payload)
3. Pakai di web lewat `socket` dari `apps/web/src/lib/socket.ts`
4. Tambah test di `apps/server/src/app.test.ts`

## Data SRD

Konten di `packages/data/src/srd/*.json` dibuat otomatis dari `rule-book/SRD_CC_v5.2.1.pdf`
dan divalidasi skema Zod di `packages/data/src/schemas.ts`.

```bash
pnpm --filter @dnd/data srd:extract   # PDF → packages/data/.cache/srd.lines.txt
pnpm --filter @dnd/data srd:build     # teks → src/srd/*.json (+ Prettier)
pnpm --filter @dnd/data test          # validasi skema + cek referensi antar-data
```

Ada data yang salah? Perbaiki parser di `packages/data/scripts/`, jangan edit JSON-nya
langsung, lalu jalankan ulang `srd:build`.

## Lisensi konten

Konten SRD berasal dari System Reference Document 5.2 oleh Wizards of the Coast LLC,
dengan lisensi [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode).
Jangan memasukkan konten non-SRD (buku berbayar) ke repo ini.
