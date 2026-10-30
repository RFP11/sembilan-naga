// Starting equipment packages ("Choose A or B: ..."), as item references.
// Source: SRD 5.2.1 class "Core Traits" tables (pp. 28–77) and "Background Descriptions" (p. 83).

import type { ItemRef, StartingEquipment } from "./schemas";

const weapon = (id: string, quantity = 1): ItemRef => ({ kind: "weapon", id, quantity });
const armor = (id: string): ItemRef => ({ kind: "armor", id, quantity: 1 });
const gear = (id: string, quantity = 1, variant?: string): ItemRef => ({
  kind: "gear",
  id,
  quantity,
  ...(variant && { variant }),
});
const tool = (id: string): ItemRef => ({ kind: "tool", id, quantity: 1 });
const book = (subject: string): ItemRef => ({
  kind: "gear",
  id: "book",
  quantity: 1,
  note: subject,
});
const arrows = gear("ammunition", 20, "Arrows");

const classes: [string, ItemRef[], number, number, ([ItemRef[], number] | undefined)?][] = [
  ["barbarian", [weapon("greataxe"), weapon("handaxe", 4), gear("explorers-pack")], 15, 75],
  [
    "bard",
    [
      armor("leather-armor"),
      weapon("dagger", 2),
      { kind: "tool", id: "musical-instrument", quantity: 1, chooseVariant: true },
      gear("entertainers-pack"),
    ],
    19,
    90,
  ],
  [
    "cleric",
    [
      armor("chain-shirt"),
      armor("shield"),
      weapon("mace"),
      gear("holy-symbol"),
      gear("priests-pack"),
    ],
    7,
    110,
  ],
  [
    "druid",
    [
      armor("leather-armor"),
      armor("shield"),
      weapon("sickle"),
      gear("druidic-focus", 1, "Wooden staff (also a Quarterstaff)"),
      gear("explorers-pack"),
      tool("herbalism-kit"),
    ],
    9,
    50,
  ],
  [
    "fighter",
    [
      armor("chain-mail"),
      weapon("greatsword"),
      weapon("flail"),
      weapon("javelin", 8),
      gear("dungeoneers-pack"),
    ],
    4,
    155,
    [
      [
        armor("studded-leather-armor"),
        weapon("scimitar"),
        weapon("shortsword"),
        weapon("longbow"),
        arrows,
        gear("quiver"),
        gear("dungeoneers-pack"),
      ],
      11,
    ],
  ],
  // Artisan's Tools or Musical Instrument: whichever the Monk chose for its tool proficiency.
  [
    "monk",
    [weapon("spear"), weapon("dagger", 5), { kind: "proficient-tool" }, gear("explorers-pack")],
    11,
    50,
  ],
  [
    "paladin",
    [
      armor("chain-mail"),
      armor("shield"),
      weapon("longsword"),
      weapon("javelin", 6),
      gear("holy-symbol"),
      gear("priests-pack"),
    ],
    9,
    150,
  ],
  [
    "ranger",
    [
      armor("studded-leather-armor"),
      weapon("scimitar"),
      weapon("shortsword"),
      weapon("longbow"),
      arrows,
      gear("quiver"),
      gear("druidic-focus", 1, "Sprig of mistletoe"),
      gear("explorers-pack"),
    ],
    7,
    150,
  ],
  [
    "rogue",
    [
      armor("leather-armor"),
      weapon("dagger", 2),
      weapon("shortsword"),
      weapon("shortbow"),
      arrows,
      gear("quiver"),
      tool("thieves-tools"),
      gear("burglars-pack"),
    ],
    8,
    100,
  ],
  [
    "sorcerer",
    [
      weapon("spear"),
      weapon("dagger", 2),
      gear("arcane-focus", 1, "Crystal"),
      gear("dungeoneers-pack"),
    ],
    28,
    50,
  ],
  [
    "warlock",
    [
      armor("leather-armor"),
      weapon("sickle"),
      weapon("dagger", 2),
      gear("arcane-focus", 1, "Orb"),
      book("occult lore"),
      gear("scholars-pack"),
    ],
    15,
    100,
  ],
  [
    "wizard",
    [
      weapon("dagger", 2),
      gear("arcane-focus", 1, "Staff (also a Quarterstaff)"),
      gear("robe"),
      { kind: "custom", name: "Spellbook" },
      gear("scholars-pack"),
    ],
    5,
    55,
  ],
];

const backgrounds: [string, ItemRef[], number][] = [
  [
    "acolyte",
    [
      tool("calligraphers-supplies"),
      book("prayers"),
      gear("holy-symbol"),
      gear("parchment", 10),
      gear("robe"),
    ],
    8,
  ],
  [
    "criminal",
    [
      weapon("dagger", 2),
      tool("thieves-tools"),
      gear("crowbar"),
      gear("pouch", 2),
      gear("clothes-travelers"),
    ],
    16,
  ],
  [
    "sage",
    [
      weapon("quarterstaff"),
      tool("calligraphers-supplies"),
      book("history"),
      gear("parchment", 8),
      gear("robe"),
    ],
    8,
  ],
  [
    "soldier",
    [
      weapon("spear"),
      weapon("shortbow"),
      arrows,
      { kind: "proficient-tool" }, // "Gaming Set (same as above)"
      gear("healers-kit"),
      gear("quiver"),
      gear("clothes-travelers"),
    ],
    14,
  ],
];

export const startingEquipment: StartingEquipment[] = [
  ...classes.map(([sourceId, a, gpA, gpLast, b]): StartingEquipment => ({
    source: "class",
    sourceId,
    options: [
      { id: "a", items: a, gp: gpA },
      ...(b ? [{ id: "b" as const, items: b[0], gp: b[1] }] : []),
      { id: b ? "c" : "b", items: [], gp: gpLast },
    ],
  })),
  ...backgrounds.map(([sourceId, a, gp]): StartingEquipment => ({
    source: "background",
    sourceId,
    options: [
      { id: "a", items: a, gp },
      { id: "b", items: [], gp: 50 },
    ],
  })),
];
