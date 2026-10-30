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
├─ docker-compose.yml   Postgres untuk dev, + profile "app" untuk menjalankan versi production
└─ Dockerfile           Satu image: server + build web
```

Paket di `packages/` diekspor sebagai source TypeScript (tanpa build step).
Vite dan tsx langsung membacanya, dan `tsup` mem-bundle-nya ke build server.

## Mulai

Butuh Node 24+ (`.nvmrc`), pnpm 10, dan Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d      # Postgres di localhost:5433
pnpm dev                  # server :4000 + web :5173
```

Buka http://localhost:5173. Coba buka dua tab, lalu geser token di tab Table: tab lain ikut bergerak.

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
