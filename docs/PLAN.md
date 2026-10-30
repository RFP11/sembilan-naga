# Rencana Pengembangan

Dokumen ini merangkum keputusan desain, skema database, dan urutan fitur.
Ubah lewat PR seperti kode lainnya.

## Keputusan

| Topik           | Keputusan                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Aturan          | **SRD 5.2.1 (aturan 2024)** satu-satunya acuan. PHB/DMG/MM 2014 tidak dipakai sebagai sumber.      |
| Karakter        | Milik user, bisa dipindah antar-campaign (`characters.campaign_id` nullable, satu campaign aktif). |
| Login           | Google OAuth, session disimpan di cookie + tabel `sessions`.                                       |
| Database        | PostgreSQL lokal (port 5432), tanpa Docker.                                                        |
| ORM / migrasi   | Drizzle di atas driver `postgres` yang sudah ada; migrasi dengan `drizzle-kit`.                    |
| File (peta dll) | Disimpan di disk (volume), DB hanya menyimpan metadata di tabel `assets`.                          |
| Dadu 3D         | `@3d-dice/dice-box-threejs` (three.js + cannon-es); hasil tetap diroll di server.                  |

Perbedaan 2024 vs 2014 yang memengaruhi kode: _species_ (bukan _race_), background memberi
ASI (+2/+1 atau +1/+1/+1, maks 20) dan satu Origin feat, Weapon Mastery, Exhaustion 6 level
(−2×level pada D20 Test, −5 ft×level pada Speed), dan Heroic Inspiration.

## Prinsip

1. **Konten SRD tetap JSON di `packages/data`**, divalidasi Zod, di-review lewat PR.
   Database hanya menyimpan referensi berupa slug (`fire-bolt`, `fighter`, `chain-mail`).
2. **Database hanya untuk data milik user**: akun, campaign, karakter, scene, token, log.
3. **Stat turunan tidak disimpan.** AC, modifier, save, skill, spell DC, passive perception,
   proficiency bonus dihitung oleh `packages/rules` dari pilihan karakter.
4. **Build dipisah dari state.** Pilihan build jarang berubah; state (HP, slot, kondisi)
   berubah tiap ronde dan punya tabel sendiri dengan kolom `version` (optimistic locking).
5. **Server otoritatif.** Setiap event socket: `safeParse` → cek keanggotaan & izin → simpan
   ke DB → broadcast. Data rahasia GM (token tersembunyi, whisper) tidak dikirim ke player.

## Skema Database

```
── Akun & campaign ─────────────────────────────────────────────────────────────
users             id uuid pk, google_sub text unique, email citext unique,
                  display_name, avatar_url, created_at
sessions          id text pk (token acak, di-hash), user_id → users, expires_at
campaigns         id uuid pk, name, description, owner_id → users,
                  invite_code unique, active_scene_id → scenes (nullable),
                  settings jsonb (metode ability score, multiclass diizinkan, dll), created_at
campaign_members  campaign_id → campaigns, user_id → users,
                  role enum(gm | player | spectator), joined_at
                  pk(campaign_id, user_id)

── Karakter ────────────────────────────────────────────────────────────────────
characters        id uuid pk, owner_id → users, campaign_id → campaigns (nullable),
                  status enum(draft | ready), builder_step smallint  -- progres builder
                  name, species_id, background_id, alignment, xp int,
                  str, dex, con, int, wis, cha smallint   -- skor DASAR sebelum bonus background
                  background_asi jsonb  -- {"str":2,"con":1} atau {"str":1,"dex":1,"con":1}
                  choices jsonb         -- skill, bahasa, tool, draconic ancestry, dll
                  portrait_asset_id → assets, notes, created_at, updated_at
character_levels  character_id → characters, level smallint (1–20),
                  class_id, subclass_id (nullable), hp_gained smallint,
                  choices jsonb         -- feat/ASI, fighting style, invocation, metamagic...
                  pk(character_id, level)
character_state   character_id pk → characters (1:1),
                  hp_current, hp_temp, hit_dice_spent jsonb {"d10":1},
                  death_save_success, death_save_fail smallint,
                  exhaustion smallint (0–6), heroic_inspiration bool,
                  spell_slots_used jsonb {"1":2}, pact_slots_used smallint,
                  feature_uses jsonb {"second-wind":1},
                  conditions text[], concentrating_on (spell_id, nullable),
                  coins jsonb {cp,sp,ep,gp,pp}, version int
character_items   id uuid pk, character_id → characters,
                  item_id (slug SRD, nullable) | homebrew_id → homebrew (nullable, kind=item),
                  name_override, quantity int, equipped bool, attuned bool,
                  charges_used smallint, notes
                  CHECK: tepat satu dari item_id / homebrew_id terisi
character_spells  id uuid pk, character_id → characters,
                  spell_id (slug SRD, nullable) | homebrew_id → homebrew (nullable, kind=spell),
                  class_id (sumber spell), prepared bool, always_prepared bool
                  CHECK: tepat satu dari spell_id / homebrew_id terisi
                  unique(character_id, coalesce(spell_id, homebrew_id), class_id)

── VTT ─────────────────────────────────────────────────────────────────────────
assets            id uuid pk, campaign_id → campaigns (nullable), uploader_id → users,
                  kind enum(map | token | portrait | handout),
                  path, mime, width, height, bytes, created_at
scenes            id uuid pk, campaign_id → campaigns, name, map_asset_id → assets,
                  cols, rows, grid_px, grid_offset_x, grid_offset_y,
                  fog_enabled bool, fog_revealed jsonb (poligon/rect), sort
tokens            id uuid pk, scene_id → scenes,
                  character_id → characters (nullable) | monster_id (slug SRD, nullable)
                  | homebrew_id → homebrew (nullable, kind=monster); paling banyak satu terisi,
                  semuanya kosong = token bebas (mis. objek/penanda),
                  name, x, y int (sel grid),
                  size enum(tiny | small | medium | large | huge | gargantuan),
                  image_asset_id → assets, hp_current, hp_max (khusus monster),
                  conditions text[], hidden bool, controlled_by uuid[], version int

── Combat & log ────────────────────────────────────────────────────────────────
encounters        id uuid pk, campaign_id, scene_id,
                  status enum(planning | active | ended), round, turn_index
combatants        id uuid pk, encounter_id → encounters, token_id → tokens,
                  initiative int, tiebreak int (Dex), sort, hidden bool
chat_messages     id uuid pk, campaign_id, user_id, character_id (nullable),
                  kind enum(text | roll | system), body, expression,
                  rolls int[], total int, label, whisper_to uuid[], created_at

── Homebrew ────────────────────────────────────────────────────────────────────
homebrew          id uuid pk, kind enum(item | spell | monster | feat),
                  owner_id → users, campaign_id → campaigns (nullable),
                  visibility enum(private | campaign),
                  base_id (slug SRD, nullable)  -- asal "Salin dari SRD", mis. "longsword", "goblin"
                  name,
                  data jsonb    -- divalidasi skema Zod SRD sesuai kind (lihat bawah)
                  image_asset_id → assets, version int, created_at, updated_at
                  index(campaign_id, kind)
```

Skema `homebrew.data` per `kind`, dari `packages/data/src/schemas.ts`:

| kind      | Skema                         | Tambahan khusus homebrew                                                                 |
| --------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `item`    | `magicItem` / `weapon` / dll. | `effects` terstruktur (bonus attack/damage/AC/save, extra damage, resistance), `charges` |
| `spell`   | `spell`                       | opsional: damage / save terstruktur untuk roll otomatis                                  |
| `monster` | `monster`                     | —                                                                                        |
| `feat`    | `feat`                        | opsional: `grants` (model pilihan builder)                                               |

Karena bentuknya sama dengan SRD, kompendium, sheet, dan VTT memperlakukan homebrew dan
SRD dengan kode yang sama; bedanya hanya sumber (`srd` atau `homebrew`) dan label di UI.

Catatan:

- **`character_levels`** menggantikan kolom `class`/`level` tunggal agar multiclass
  (prasyarat skor ≥13, slot dari Multiclass Spellcaster table) dan riwayat HP per level
  tersimpan. Total level, proficiency bonus, dan hit dice dihitung dari tabel ini.
- **`choices` (jsonb)** divalidasi dengan discriminated union Zod di `packages/contracts`,
  karena bentuk pilihan tiap fitur berbeda.
- **Memindah karakter** ke campaign lain = ganti `campaign_id`. Token di scene lama dihapus,
  `character_state` ikut terbawa.
- **Referensi ke SRD** (slug) tidak bisa memakai foreign key; validasi di lapisan aplikasi.
- **Pindah dari 2014**: hanya SRD yang boleh masuk `packages/data` (lihat Lisensi di README).

## Fitur per Fase

### Fase 0 – Fondasi (Backend) ✅

- ✅ Drizzle + migrasi `0000_foundation` (`apps/server/src/db/`). Tabel lain di skema di atas
  dibuat lewat migrasi di fase yang memakainya, bukan di depan.
- ✅ Login Google (arctic, OAuth 2.0 + PKCE), session cookie httpOnly; tabel `sessions`
  menyimpan hash SHA-256 token, kedaluwarsa 30 hari dengan perpanjangan otomatis. Env baru:
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL`, `DEV_LOGIN` (tidak perlu
  `SESSION_SECRET` karena token disimpan sebagai hash).
- ✅ Campaign: buat, invite code (8 karakter, tanpa 0/O/1/I), gabung, role GM/player/spectator;
  invite code hanya dikirim ke GM.
- ✅ Socket.IO memakai session yang sama (anonim ditolak), `campaign:join` cek keanggotaan,
  spectator tidak bisa menggerakkan token / melempar dadu, lemparan dadu disimpan ke
  `chat_messages` dan riwayatnya tersedia di `GET /api/campaigns/:id/rolls`.
- ✅ Web: layar login (Google / dev login), pemilih campaign (buat / gabung / pilih),
  Table & dice log memakai campaign yang dipilih.
- ✅ Server menjalankan migrasi tertunda saat start; image Docker membawa folder migrasi.
- ✅ CI menjalankan Postgres service untuk test server.
- ✅ Setup database & seeder (lihat bawah) supaya anggota tim bisa mulai dengan satu perintah.

#### Setup database & seeder

Target: anggota tim baru cukup menjalankan

```bash
pnpm install
cp .env.example .env      # isi DATABASE_URL ke Postgres lokal masing-masing
pnpm db:setup             # buat DB → migrasi → seed
pnpm dev
```

| Perintah           | Fungsi                                                                          |
| ------------------ | ------------------------------------------------------------------------------- |
| `pnpm db:create`   | Buat database dari `DATABASE_URL` (dan `<nama>_test` untuk test) bila belum ada |
| `pnpm db:migrate`  | Jalankan migrasi Drizzle                                                        |
| `pnpm db:generate` | Buat file migrasi baru dari perubahan skema (di-commit bersama PR)              |
| `pnpm db:seed`     | Isi data contoh untuk development                                               |
| `pnpm db:setup`    | `db:create` + `db:migrate` + `db:seed`                                          |
| `pnpm db:reset`    | Drop & buat ulang DB lalu `db:setup` (menolak jalan bila `NODE_ENV=production`) |
| `pnpm db:studio`   | Drizzle Studio untuk melihat isi tabel                                          |

Aturan seeder (`apps/server/src/db/seed/`):

- **Idempotent**: UUID tetap + upsert, aman dijalankan berulang kali.
- **Hanya untuk development/test**; menolak jalan di production.
- **Tidak menyalin kompendium SRD** ke DB (tetap JSON); seed hanya merujuk slug.
- Data yang di-seed (✅ = sudah, sisanya ditambahkan di fase yang membuat tabelnya):
  - ✅ 3 user dev: `gm@dev.local` (GM), `player1@dev.local`, `player2@dev.local`
  - ✅ 1 campaign contoh dengan invite code tetap (`DEVCAMP`) dan ketiga user sebagai member
  - ✅ Beberapa `chat_messages` roll
  - Fase 2 — Karakter: beberapa `ready` (mis. Fighter, Wizard, Cleric level 1 & 5, satu multiclass)
    dan satu `draft` di tengah builder; satu karakter tanpa campaign (uji pindah campaign)
  - Fase 2 (monster: Fase 4) — Homebrew contoh per `kind`: item (`private` dan `campaign`, satu berbasis item SRD),
    spell, feat, dan monster (salinan monster SRD yang diedit)
  - Fase 3 — 1 scene dengan peta placeholder (gambar grid buatan sendiri, bukan aset berlisensi),
    token PC + monster SRD (satu `hidden`), dan satu encounter `planning`
- Karakter seed dibuat lewat fungsi builder yang sama dengan aplikasi, jadi seed sekaligus
  menguji validasi.

**Login di development**: Google OAuth butuh client ID, jadi saat `NODE_ENV=development`
dan `DEV_LOGIN=true` tersedia endpoint login cepat sebagai user seed (pilih dari dropdown).
Tidak pernah aktif di production. Anggota tim tidak wajib punya kredensial Google untuk mulai.

**Test**: Vitest server memakai database `<nama>_test`, dimigrasi otomatis sebelum test
dan dibersihkan per test (transaksi yang di-rollback atau truncate).

### Fase 1 – Kompendium SRD (Data SRD)

- Skrip impor PDF → JSON di `packages/data/scripts` (`srd:extract`, `srd:build`).
- ✅ Sudah: 6 ability, 18 skill, 13 damage type, 15 kondisi, 19 bahasa, 155 entri glossary,
  38 senjata + 10 property + 8 mastery, 13 armor, 25 tools, 80 gear, 258 magic item,
  339 spell, 9 species, 4 background, 17 feat, 12 kelas (tabel fitur, fitur, subclass,
  Metamagic & Eldritch Invocations).
- Halaman kompendium: cari & filter (level, school, kelas, CR, tipe).

Sisa pekerjaan data, berurutan:

**1. ✅ Opsi bertingkat pada trait** (kecil, di parser)

- Skema `trait` mendapat `options?: trait[]`.
- `build-origins.ts` memakai daftar eksplisit induk → opsi, karena PDF tidak menandai
  hubungannya: Gnomish Lineage → Forest Gnome, Rock Gnome; Giant Ancestry → Cloud’s Jaunt,
  Fire’s Burn, Frost’s Chill, Hill’s Tumble, Stone’s Endurance, Storm’s Thunder.
- Test: tidak ada trait opsi yang muncul juga sebagai trait biasa.

**2. ✅ Monster & hewan** (`build-monsters.ts` → `monsters.json`, 330 stat block: 235 monster + 95 hewan)

- Kelompok (heading 18, mis. "Azer") + stat block (heading 14.6, mis. "Azer Sentinel").
- Field terstruktur: size, type, tag, alignment; AC; Initiative; HP (rata-rata + rumus);
  Speed (walk/fly/swim/climb/burrow, hover); 6 ability (skor, mod, save); Skills;
  Resistances / Vulnerabilities / Immunities (damage dan kondisi dipisah); Gear; Senses
  (+ Passive Perception); Languages; CR, XP, PB; Legendary Action Uses; `isAnimal`.
- Entri Traits / Actions / Bonus Actions / Reactions / Legendary Actions: nama, teks
  Markdown, plus data yang bisa dihitung VTT:
  - serangan: melee/ranged, bonus to-hit, reach/range, damage `[{ avg, dice, type }]`
  - saving throw: ability, DC, area
  - pemakaian: `Recharge 5–6`, `3/Day`, `1/Day Each`
- Test: 330 entri; XP sesuai CR; PB sesuai CR; modifier = ⌊(skor−10)/2⌋;
  semua damage type & kondisi merujuk ke data yang ada.
- Inkonsistensi yang memang tercetak di SRD dibiarkan apa adanya dan dicatat sebagai
  pengecualian di test: XP Archmage (8.000, tabel CR 12 = 8.400), skor Initiative
  Gray Ooze dan Invisible Stalker.
- Dipakai oleh: kompendium (filter CR/tipe), token monster di VTT, encounter builder
  (XP budget), tombol serang yang roll otomatis.

**3. ✅ Data terstruktur untuk builder** (ditulis manual, `packages/data/src/builder/`)

Tabel multi-kolom di PDF tidak bisa di-parse andal, dan builder butuh data yang bisa
dihitung, bukan teks. Ditulis tangan sebagai TypeScript bertipe di
`packages/data/src/builder/`, terpisah dari JSON hasil generate, dengan nomor halaman SRD
di komentar untuk review.

- Model pilihan yang dipakai ulang di semua tempat:
  `Choice { id, name, options: { id, name, grants: Grant[] }[] }`, dengan `Grant` berupa
  union: resistance, spell (dengan level karakter minimum), cantrip, speed, darkvision,
  skill/tool proficiency, feat, ability score, dll.
- Species: Draconic Ancestry (10 naga → damage type), Elven Lineages (Drow / High Elf /
  Wood Elf: manfaat level 1, spell level 3 & 5), Gnomish Lineage, Giant Ancestry,
  Fiendish Legacies (Abyssal / Chthonic / Infernal), Keen Senses, Skillful, Versatile,
  pilihan spellcasting ability, ukuran Small/Medium.
- Peralatan awal: paket A/B/C tiap kelas dan A/B tiap background → daftar
  `{ kind, id, quantity, variant?, note? }` + GP, merujuk ke id weapons/armor/gear/tools.
  Dua bentuk khusus: `proficient-tool` (Monk, Soldier: alat yang dipilih untuk proficiency)
  dan `custom` (Spellbook Wizard, yang bukan item di daftar peralatan SRD).
- Tabel builder lain yang kecil (Standard Array by Class, Point Cost) masuk ke
  `packages/rules` sebagai konstanta + fungsi.
- Test: setiap id spell / skill / item / feat yang dirujuk benar-benar ada di data SRD,
  level spell lineage cocok (cantrip, level 1 di level 3, level 2 di level 5), varian item
  ada di tabel item-nya, dan opsi serta GP paket awal sama dengan teks SRD; salah ketik di
  data manual langsung ketahuan di CI.
- Belum: pilihan fitur kelas (Fighting Style, Expertise, dll.) memakai model `Choice` yang
  sama; ditambahkan bersama UI builder.

### Fase 2 – Character Builder & Sheet (Rules engine + Frontend)

**Character builder** (wizard 5 langkah sesuai SRD):

1. **Kelas** – kartu 12 kelas (primary ability, hit die, kompleksitas), pilih level awal
   (level ≥3 langsung pilih subclass; XP awal = minimum level itu).
2. **Origin** – background (tampilkan 3 ability, Origin feat, 2 skill, tool), species
   (size, speed, trait + pilihan seperti Draconic Ancestry), 2 bahasa + Common.
3. **Ability score** – standard array (15,14,13,12,10,8), point buy 27 (8–15),
   atau 4d6 drop lowest (diroll di server); saran dari _Standard Array by Class_;
   lalu ASI background +2/+1 atau +1/+1/+1 (maks 20).
4. **Alignment** – 9 pilihan.
5. **Detail** – skill kelas, fighting style/cantrip/spell awal, peralatan awal
   (paket A/B/C atau GP), nama, portrait, cerita latar.

Perilaku builder:

- Karakter disimpan sebagai `draft` di tiap langkah (bisa ditinggal dan dilanjutkan),
  jadi `ready` setelah validasi akhir lolos.
- Panel preview live: HP, AC, modifier, save, skill, spell DC, dihitung `packages/rules`.
- Validasi yang sama dipakai di web (UX) dan server (otoritatif), dari `packages/contracts`.
- Pilihan yang tidak lagi valid (mis. ganti kelas) ditandai dan harus dipilih ulang.
- Level-up memakai komponen langkah yang sama (pilihan fitur, feat/ASI, spell baru).

**Sheet:**

- Sheet dengan semua stat turunan otomatis.
- Level-up: HP tetap atau roll (min 1), fitur baru, subclass di level 3, multiclass.
- Short rest (hit dice) dan long rest (HP & slot pulih, Exhaustion −1).
- Inventory (SRD + homebrew), attunement (maks 3), spell prepared.
- Tombol serang/spell → roll di server → dice log.

**Homebrew (dasar bersama + item, spell, feat):**

Dasar yang dibangun sekali untuk semua `kind`:

- API: `GET/POST/PATCH/DELETE /api/campaigns/:id/homebrew?kind=…`; server cek role,
  validasi `data` dengan skema sesuai `kind`, simpan, lalu broadcast `homebrew:updated`.
- "Salin dari SRD": membuat homebrew dari entri SRD (`base_id`), lalu diedit. SRD tidak
  pernah diubah; GM yang ingin versi berbeda memakai salinan ini.
- Visibilitas: `private` (hanya pembuat) atau `campaign` (semua anggota campaign).
  Player boleh membuat homebrew `campaign` hanya bila diizinkan di `campaigns.settings`.
- Kompendium menggabungkan SRD + homebrew yang boleh dilihat user, dengan label "Homebrew"
  dan filter sumber.
- Ekspor/impor JSON (skema yang sama) agar bisa dibagi antar-campaign.

Per jenis:

- **Item**: editor kategori, rarity, attunement, damage/properties/mastery, `effects`
  (bonus attack/damage/AC/save, extra damage, resistance), charges + recharge, gambar.
  Item berbasis SRD (`base_id`, mis. Longsword → +1 Flame Longsword) mewarisi data dasarnya.
  GM bisa memberi item ke karakter; efeknya dihitung `packages/rules` seperti item SRD.
- **Spell**: editor level, school, kelas, casting time, range, komponen, durasi,
  concentration/ritual, deskripsi, higher levels. Muncul di pilihan spell builder bila
  kelasnya cocok dan diizinkan GM.
- **Feat**: kategori, prasyarat, repeatable, benefit; `grants` opsional agar builder bisa
  menerapkan efeknya otomatis.

### Fase 3 – VTT

- Scene, upload peta, atur grid.
- Token tersimpan di DB. Izin: GM bebas, player hanya token yang dia kontrol.
- Drag: client kirim preview ter-throttle (tidak disimpan), simpan saat token dilepas.
- Token `hidden` tidak dikirim ke player.
- Fog of war (GM membuka area), alat ukur jarak, ping.

### Fase 4 – Combat

- Encounter builder dengan XP Budget per Character (Low / Moderate / High).
- Initiative tracker (monster memakai nilai Initiative di stat block), giliran, ronde.
- HP & kondisi di token, pengingat concentration, efek Exhaustion otomatis.

#### Homebrew monster

- Editor stat block, biasanya lewat "Salin dari SRD" (mis. Goblin → Goblin Shaman).
- Angka turunan dihitung `packages/rules` saat mengedit: modifier dari skor, PB dan XP
  dari CR, save = mod (+ PB bila proficient), Initiative, Passive Perception.
- Action/trait sebagai entri terstruktur (to-hit, reach/range, damage, save DC, usage),
  sama dengan monster SRD, sehingga tombol serang di VTT langsung berfungsi.
- Default `private`: stat monster tidak terlihat player. Di VTT player hanya melihat nama
  token dan kondisinya.
- Bisa dipakai di encounter builder (XP masuk XP budget) dan dijadikan token.

#### Dadu 3D

Library: [`@3d-dice/dice-box-threejs`](https://github.com/3d-dice/dice-box-threejs)
(three.js + cannon-es). Dipilih karena mendukung **hasil yang ditentukan**
(`roll("2d20@17,4")`), sehingga server tetap jadi sumber hasil dan animasi hanya tampilan.

Alur:

1. Client kirim `dice:roll` (ekspresi + label), seperti sekarang.
2. Server roll dengan `packages/rules`, simpan ke `chat_messages`, broadcast `dice:rolled`
   berisi hasil **per kelompok dadu** (jenis dadu + nilai tiap dadu).
3. Setiap client menyusun notasi `@` dari hasil server dan melempar dadu 3D; semua tab
   melihat dadu mendarat di angka yang sama.
4. Dice log menampilkan total setelah animasi selesai (atau langsung bila animasi dimatikan).

Pekerjaan yang dibutuhkan:

- **Rules**: parser dadu saat ini hanya mendukung satu kelompok (`2d6+3`). Perluas ke
  beberapa kelompok (`1d8+2d6+3`), advantage/disadvantage (`2d20kh1` / `2d20kl1`),
  dan `d100` (ditampilkan sebagai d100 + d10 di 3D). Tetap murni & ber-test.
- **Contracts**: `diceRollResult` diubah dari `rolls: number[]` menjadi daftar kelompok
  `{ sides, rolls, kept }`, ditambah flag `hidden` untuk roll GM.
- **Web**: canvas three.js terpisah di atas board PixiJS (`pointer-events: none`),
  di-load secara lazy agar tidak memperberat halaman lain; antrean bila banyak roll sekaligus.
- **Privasi**: roll tersembunyi GM hanya dianimasikan di layar GM; player menerima
  "GM melempar dadu" tanpa angka.
- **Pengaturan per user** (disimpan lokal): animasi on/off, warna/tema dadu, suara.
- **Spike dulu**: uji satu hari bahwa notasi `@` stabil (dadu benar-benar mendarat di nilai
  yang diminta) untuk d4–d20 dan d100 sebelum dipakai penuh. Bila gagal, fallback ke dice log
  2D tanpa mengubah alur server.

### Fase 5 – Lanjutan

Homebrew jenis lain bila dibutuhkan (species, background, subclass; cukup menambah `kind`
dan skemanya), jurnal & handout, whisper di chat.

## Tambahan `packages/rules` ✅

Semua murni, randomness di-inject, dan ber-test. Tabel spell slot dan Pact Magic diuji silang
terhadap tabel fitur 12 kelas hasil ekstraksi SRD (`srd-tables.test.ts`).

- Modifier, proficiency bonus per level, XP → level
- Validasi point buy dan ASI background
- HP level 1 dan per level (tetap/roll), hit dice per kelas
- AC: armor + Dex (cap medium), shield, Unarmored Defense, bonus item magic/homebrew
- Prasyarat multiclass (skor 13+ di primary ability kelas lama dan baru)
- ⏳ Validasi langkah builder (pilihan wajib per kelas/background/species): bersama UI builder
- Spell slot: full caster, half caster, Pact Magic, Multiclass Spellcaster table
- Spell save DC & spell attack bonus
- Passive Perception, efek Exhaustion
- XP budget encounter

## Item Terbuka

- File PHB/DMG/MM (2014, non-SRD) ter-commit di `rule-book/`. Keluarkan dari git
  dan masukkan ke `.gitignore`; bersihkan history bila repo pernah publik.
- README sudah memuat setup Postgres lokal dan daftar perintah `db:*`; hapus catatan
  "Belum tersedia" di README setelah perintah tersebut dibuat di Fase 0.
