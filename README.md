# DnD App

Aplikasi D&D 5e self-hosted: lembar karakter, kompendium SRD, dan virtual tabletop (VTT).

## Struktur

```
dnd-app/
├─ packages/
│  ├─ contracts/   Skema Zod untuk REST API + event Socket.IO (dipakai web & server)
│  ├─ rules/       Logika D&D murni (modifier, proficiency, dadu) + unit test
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

### 1. Siapkan Postgres

Buat role Postgres untuk akun kamu (sekali saja), lalu buat database-nya:

```bash
sudo -u postgres createuser --createdb --pwprompt $USER   # isi password
createdb -h localhost dnd
```

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

Cek koneksi: `psql "$DATABASE_URL" -c 'select 1'` (jalankan setelah `source .env`),
atau buka http://localhost:4000/api/health setelah `pnpm dev`: `"db": "up"` berarti tersambung.

### 3. Jalankan

```bash
pnpm dev                  # server :4000 + web :5173
```

Buka http://localhost:5173. Coba buka dua tab, lalu geser token di tab Table: tab lain ikut bergerak.

## Database

> **Belum tersedia.** Perintah di bawah dibuat di Fase 0 (lihat [docs/PLAN.md](docs/PLAN.md)).
> Setelah itu, langkah 1 dan 3 di atas cukup diganti `pnpm db:setup` lalu `pnpm dev`.

| Perintah           | Fungsi                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| `pnpm db:setup`    | Buat database bila belum ada, jalankan migrasi, lalu isi data contoh          |
| `pnpm db:create`   | Buat database dari `DATABASE_URL` + database `<nama>_test` untuk test         |
| `pnpm db:migrate`  | Jalankan migrasi Drizzle                                                      |
| `pnpm db:generate` | Buat file migrasi dari perubahan skema; commit bersama PR yang mengubah skema |
| `pnpm db:seed`     | Isi data contoh (aman dijalankan berulang)                                    |
| `pnpm db:reset`    | Hapus dan buat ulang database lalu `db:setup` (ditolak di production)         |
| `pnpm db:studio`   | Buka Drizzle Studio untuk melihat isi tabel                                   |

Data contoh dari seeder (hanya development/test):

- User: `gm@dev.local` (GM), `player1@dev.local`, `player2@dev.local`
- Campaign contoh dengan invite code `DEVCAMP`
- Beberapa karakter jadi, satu karakter `draft`, dan satu tanpa campaign
- Homebrew item, satu scene dengan token, dan satu encounter

Login memakai Google. Di development, set `DEV_LOGIN=true` di `.env` untuk login cepat
sebagai user seed tanpa kredensial Google.

Aturan skema:

- Ubah skema di kode Drizzle, lalu `pnpm db:generate`. Jangan mengedit tabel langsung lewat SQL.
- Konten SRD (spell, monster, item) **tidak** disimpan di database; tetap JSON di `packages/data`.

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

## Menambah event real-time

1. Tambah skema + tipe di `packages/contracts/src/socket.ts`
2. Tangani di `apps/server/src/plugins/socket.ts` (selalu `safeParse` payload)
3. Pakai di web lewat `socket` dari `apps/web/src/lib/socket.ts`
4. Tambah test di `apps/server/src/app.test.ts`

## Lisensi konten

Konten SRD berasal dari System Reference Document 5.2 oleh Wizards of the Coast LLC,
dengan lisensi [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode).
Jangan memasukkan konten non-SRD (buku berbayar) ke repo ini.
