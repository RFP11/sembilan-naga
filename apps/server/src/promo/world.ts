// Player-facing world text for the public campaign page, one version per map era.
//
// This stays on the server: a browser only ever receives the era the DM has switched on, so
// later eras can't be read from the page source. DM secrets don't belong in this file at all,
// nor do the hidden island and the secret faction.

import type { MapEra, PromoFaction, PromoIsland, PromoResponse } from "@dnd/contracts";

type EraText = Record<MapEra, string>;

interface Island extends Omit<PromoIsland, "now" | "start" | "offset" | "gone"> {
  era: EraText;
  /** Eras in which a new character can start here. */
  startIn: MapEra[];
  sink: Record<MapEra, number>;
}

const EVERY_ERA: MapEra[] = ["emas", "pertanda", "senja"];

const ISLANDS: Island[] = [
  {
    id: "simpang",
    name: "Simpang Langit",
    title: "Ibu kota dan kursi Dewan Langit",
    layer: "Tengah",
    vibe: "Kota besar, politik antarras",
    folk: ["Semua species"],
    faction: "Dewan Langit",
    hook: "Seorang anggota Dewan Langit dibunuh sehari sebelum pemungutan suara soal rute dagang Karang Besi.",
    era: {
      emas: "Tempat semua ras berkumpul; pusat politik seluruh langit.",
      pertanda: "Dewan terpecah soal Karang Besi dan desas-desus tentang matahari.",
      senja: "Ibu kota kebanjiran pengungsi dari lapisan rendah.",
    },
    startIn: [],
    sink: { emas: 0, pertanda: 10, senja: 64 },
  },
  {
    id: "solmara",
    name: "Solmara",
    title: "Takhta Gereja Surya",
    layer: "Atas",
    vibe: "Intrik politik dan agama",
    folk: ["Human", "Dragonborn"],
    faction: "Gereja Surya",
    hook: "Para Terpilih Gereja Surya tak pernah kembali, dan sebuah keluarga bangsawan mulai menuntut jawaban.",
    era: {
      emas: "Pusat kekuasaan yang tenang dan makmur.",
      pertanda:
        "Gereja memilih lebih banyak Terpilih. Saat pulau-pulau rendah jatuh, Solmara tidak turun sedikit pun.",
      senja:
        "Pulau-pulau lain menuduh gereja menyembunyikan sesuatu, sebab Solmara tetap di puncak.",
    },
    startIn: [],
    sink: { emas: 0, pertanda: 0, senja: 0 },
  },
  {
    id: "pasar",
    name: "Pasar Angin",
    title: "Pelabuhan kapal udara",
    layer: "Tengah",
    vibe: "Heist, dagang, intrik serikat",
    folk: ["Halfling", "Gnome", "Human"],
    faction: "Serikat Layar",
    hook: "Kapal pengangkut batu-surya lenyap di tengah jalur dagang paling aman.",
    era: {
      emas: "Jalur dagang ramai; siapa saja bisa kaya.",
      pertanda: "Harga batu-surya melonjak dan serikat dagang saling sabotase.",
      senja: "Kapal udara menjadi barang paling berharga untuk mengungsi.",
    },
    startIn: EVERY_ERA,
    sink: { emas: 0, pertanda: 10, senja: 64 },
  },
  {
    id: "karang",
    name: "Karang Besi",
    title: "Pulau tambang batu-surya",
    layer: "Tengah",
    vibe: "Dungeon, konflik buruh",
    folk: ["Dwarf", "Goliath"],
    faction: "Serikat Tambang",
    hook: "Tambang terlalu dalam: pulau mulai turun beberapa meter setiap bulan.",
    era: {
      emas: "Tambang menopang ekonomi seluruh langit.",
      pertanda: "Pulau ini menjadi rebutan kerajaan dan serikat dagang.",
      senja: "Batu-surya yang tersisa dijaga mati-matian.",
    },
    startIn: EVERY_ERA,
    sink: { emas: 0, pertanda: 38, senja: 115 },
  },
  {
    id: "rimba",
    name: "Rimbaraya",
    title: "Pulau hutan purba",
    layer: "Tengah",
    vibe: "Eksplorasi, horor hutan",
    folk: ["Elf"],
    faction: "Lingkar Akar",
    hook: "Hutan menyerang penebang, dan para druid menolak menjelaskan sebabnya.",
    era: {
      emas: "Hutan liar yang jarang dijelajahi.",
      pertanda: "Para druid merasakan sesuatu berubah dan mulai menutup hutan.",
      senja: "Hutan menjadi tempat berlindung sekaligus rebutan.",
    },
    startIn: EVERY_ERA,
    sink: { emas: 0, pertanda: 10, senja: 64 },
  },
  {
    id: "badai",
    name: "Gugus Badai",
    title: "Gugusan pulau kecil di jalur badai",
    layer: "Rendah",
    vibe: "Perompak langit, sandbox bebas",
    folk: ["Orc", "Tiefling", "Human"],
    faction: "Anak Bayuhara",
    hook: "Seorang kapten perompak mengaku punya peta menuju Bawah.",
    era: {
      emas: "Sarang perompak yang bebas hukum.",
      pertanda: "Batu-suryanya kehilangan energi; pulau-pulaunya turun lalu jatuh ke kabut.",
      senja: "Sudah hilang di kabut. Perompak yang selamat kini menjadi pengungsi atau penjarah.",
    },
    // It starts falling in Pertanda, so it stops being a place to begin a character.
    startIn: ["emas"],
    sink: { emas: 0, pertanda: 125, senja: 420 },
  },
  {
    id: "nadir",
    name: "Nadir",
    title: "Pulau terendah di tepi kabut",
    layer: "Rendah",
    vibe: "Horor, misteri",
    folk: ["Tiefling", "Human"],
    faction: "Penjaga Kabut",
    hook: "Mayat dari kabut tersangkut di tepian pulau, dan sebagian masih bergerak.",
    era: {
      emas: "Pulau miskin yang dijauhi orang atas.",
      pertanda: "Batu-suryanya kehilangan energi; Nadir turun lalu jatuh ke kabut.",
      senja: "Sudah hilang di kabut dan menjadi bagian dari Bawah.",
    },
    startIn: [],
    sink: { emas: 0, pertanda: 145, senja: 420 },
  },
];

const ROUTES: [string, string][] = [
  ["simpang", "solmara"],
  ["simpang", "pasar"],
  ["simpang", "karang"],
  ["simpang", "rimba"],
  ["pasar", "solmara"],
  ["pasar", "badai"],
  ["rimba", "solmara"],
  ["karang", "nadir"],
];

const ERAS: Record<MapEra, PromoResponse["eraInfo"]> = {
  emas: {
    name: "Era Emas",
    tag: "Season 1 · level 1–8 · petualangan dan perdagangan",
    items: [
      "Matahari tampak normal",
      "Perdagangan kapal udara",
      "Perompak dan eksplorasi pulau baru",
      "Politik antarpulau dan perselisihan Karang Besi dengan Rimbaraya",
    ],
    summary:
      "Langit sedang ramai dan penuh peluang. Kamu memilih sendiri dari pulau mana kamu mulai.",
  },
  pertanda: {
    name: "Era Pertanda",
    tag: "Season 2 · level 9–14 · misteri dan intrik",
    items: [
      "Gerhana aneh muncul",
      "Batu-surya di pulau terbawah mulai kehilangan energi",
      "Gugus Badai dan Nadir jatuh ke kabut",
      "Harga batu-surya melonjak",
      "Kultus baru bermunculan",
    ],
    summary: "Solmara tetap di puncak dan tidak turun sedikit pun. Karang Besi menjadi rebutan.",
  },
  senja: {
    name: "Era Senja",
    tag: "Season 3 · level 15–20 · epik akhir zaman",
    items: [
      "Matahari jelas sekarat",
      "Pulau-pulau curiga pada Gereja Surya karena Solmara tak pernah turun",
      "Sesuatu telah turun ke dunia",
      "Pengungsi dari pulau yang jatuh membanjiri kota-kota",
      "Ekspedisi turun ke Bawah",
    ],
    summary:
      "Gugus Badai dan Nadir sudah hilang di kabut. Pengungsinya membanjiri Simpang Langit, dan semua mata tertuju pada Solmara.",
  },
};

const FACTIONS: PromoFaction[] = [
  {
    name: "Gereja Surya",
    island: "Solmara",
    blurb:
      "Penguasa pulau tertinggi. Setiap tahun gereja memilih Para Terpilih, dan tak satu pun pernah terlihat lagi.",
    rival: "Dicurigai oleh rakyat dan keluarga Para Terpilih",
    feud: false,
  },
  {
    name: "Dewan Langit",
    island: "Simpang Langit",
    blurb:
      "Dewan perwakilan semua pulau dan ras. Tugasnya menjaga keseimbangan dan jalur dagang antarpulau, tapi perselisihan Karang Besi dan Rimbaraya memecah suaranya.",
    rival: "Melawan siapa pun yang mengancam rute dagang",
    feud: false,
  },
  {
    name: "Serikat Tambang",
    island: "Karang Besi",
    blurb:
      "Menggali batu-surya dan sumber daya bumi sebanyak mungkin. Bagi mereka, hutan Rimbaraya hanyalah tambang yang belum dibuka.",
    rival: "Berselisih dengan Lingkar Akar",
    feud: true,
  },
  {
    name: "Lingkar Akar",
    island: "Rimbaraya",
    blurb:
      "Para penjaga hutan yang melestarikan hutan purba dan menolak penambangan. Bagi mereka, Karang Besi sedang membunuh pulaunya sendiri.",
    rival: "Berselisih dengan Serikat Tambang",
    feud: true,
  },
  {
    name: "Serikat Layar",
    island: "Pasar Angin",
    blurb: "Serikat pilot dan pedagang yang menguasai rute serta izin terbang kapal udara.",
    rival: "Berselisih dengan Anak Bayuhara",
    feud: false,
  },
  {
    name: "Anak Bayuhara",
    island: "Gugus Badai",
    blurb:
      "Persekutuan kapten perompak pemuja dewa angin; pemimpinnya adalah kapten dengan kapal terkuat.",
    rival: "Berselisih dengan Serikat Layar",
    feud: false,
  },
  {
    name: "Penjaga Kabut",
    island: "Nadir",
    blurb:
      "Mereka merawat mayat yang tersangkut di tepian pulau dan meminum air kabut untuk mendengar suara orang mati.",
    rival: "Dianggap sesat oleh Gereja Surya",
    feud: false,
  },
];

/** The page content for one era. Nothing from any other era is included. */
export function worldForEra(
  era: MapEra,
): Pick<PromoResponse, "era" | "eraInfo" | "islands" | "routes" | "factions"> {
  return {
    era,
    eraInfo: ERAS[era],
    islands: ISLANDS.map(({ era: text, startIn, sink, ...island }) => ({
      ...island,
      now: text[era],
      start: startIn.includes(era),
      offset: sink[era],
      gone: sink[era] >= 400,
    })),
    routes: ROUTES,
    factions: FACTIONS,
  };
}

export function canStartOn(era: MapEra, islandId: string): boolean {
  return ISLANDS.some((i) => i.id === islandId && i.startIn.includes(era));
}
