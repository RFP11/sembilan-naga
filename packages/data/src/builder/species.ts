// What each species grants, as data the builder and rules engine can apply.
// Source: SRD 5.2.1 "Character Origins" → "Species Descriptions" (pp. 84–86).

import type { Choice, Grant, SpeciesBuilder } from "./schemas";

const spellcastingAbility = (trait: string): Choice => ({
  id: "spellcasting-ability",
  name: "Spellcasting Ability",
  trait,
  options: (["int", "wis", "cha"] as const).map((ability) => ({
    id: ability,
    name: { int: "Intelligence", wis: "Wisdom", cha: "Charisma" }[ability],
    grants: [{ type: "spellcasting-ability", ability }],
  })),
});

const size: Choice = {
  id: "size",
  name: "Size",
  trait: "Size",
  options: [
    { id: "medium", name: "Medium", grants: [{ type: "size", size: "medium" }] },
    { id: "small", name: "Small", grants: [{ type: "size", size: "small" }] },
  ],
};

/** Cantrip at level 1, then always-prepared spells at character levels 3 and 5 (once per Long Rest free). */
const lineageSpells = (cantrip: string, level3: string, level5: string): Grant[] => [
  { type: "cantrip", spellId: cantrip },
  { type: "spell", spellId: level3, minLevel: 3, freeCasts: "once" },
  { type: "spell", spellId: level5, minLevel: 5, freeCasts: "once" },
];

const DRACONIC_ANCESTORS = [
  ["black", "Black", "acid"],
  ["blue", "Blue", "lightning"],
  ["brass", "Brass", "fire"],
  ["bronze", "Bronze", "lightning"],
  ["copper", "Copper", "acid"],
  ["gold", "Gold", "fire"],
  ["green", "Green", "poison"],
  ["red", "Red", "fire"],
  ["silver", "Silver", "cold"],
  ["white", "White", "cold"],
] as const;

const GIANT_ANCESTRY = [
  ["cloud", "Cloud’s Jaunt (Cloud Giant)"],
  ["fire", "Fire’s Burn (Fire Giant)"],
  ["frost", "Frost’s Chill (Frost Giant)"],
  ["hill", "Hill’s Tumble (Hill Giant)"],
  ["stone", "Stone’s Endurance (Stone Giant)"],
  ["storm", "Storm’s Thunder (Storm Giant)"],
] as const;

export const speciesBuilders: SpeciesBuilder[] = [
  {
    speciesId: "dragonborn",
    grants: [{ type: "darkvision", range: 60 }],
    choices: [
      {
        id: "draconic-ancestry",
        name: "Draconic Ancestry",
        trait: "Draconic Ancestry",
        // The damage type drives both Damage Resistance and Breath Weapon.
        options: DRACONIC_ANCESTORS.map(([id, name, damageType]) => ({
          id,
          name,
          grants: [{ type: "resistance", damageType }],
        })),
      },
    ],
  },
  {
    speciesId: "dwarf",
    grants: [
      { type: "darkvision", range: 120 },
      { type: "resistance", damageType: "poison" },
      { type: "hit-points-per-level", value: 1 },
    ],
    choices: [],
  },
  {
    speciesId: "elf",
    grants: [{ type: "darkvision", range: 60 }],
    choices: [
      {
        id: "elven-lineage",
        name: "Elven Lineage",
        trait: "Elven Lineage",
        options: [
          {
            id: "drow",
            name: "Drow",
            grants: [
              { type: "darkvision", range: 120 },
              ...lineageSpells("dancing-lights", "faerie-fire", "darkness"),
            ],
          },
          {
            id: "high-elf",
            name: "High Elf",
            // The cantrip can be swapped for another Wizard cantrip after each Long Rest.
            grants: lineageSpells("prestidigitation", "detect-magic", "misty-step"),
          },
          {
            id: "wood-elf",
            name: "Wood Elf",
            grants: [
              { type: "speed", walk: 35 },
              ...lineageSpells("druidcraft", "longstrider", "pass-without-trace"),
            ],
          },
        ],
      },
      spellcastingAbility("Elven Lineage"),
      {
        id: "keen-senses",
        name: "Keen Senses",
        trait: "Keen Senses",
        options: (["insight", "perception", "survival"] as const).map((skillId) => ({
          id: skillId,
          name: skillId[0]!.toUpperCase() + skillId.slice(1),
          grants: [{ type: "skill", skillId }],
        })),
      },
    ],
  },
  {
    speciesId: "gnome",
    grants: [{ type: "darkvision", range: 60 }],
    choices: [
      {
        id: "gnomish-lineage",
        name: "Gnomish Lineage",
        trait: "Gnomish Lineage",
        options: [
          {
            id: "forest-gnome",
            name: "Forest Gnome",
            grants: [
              { type: "cantrip", spellId: "minor-illusion" },
              {
                type: "spell",
                spellId: "speak-with-animals",
                minLevel: 1,
                freeCasts: "proficiency-bonus",
              },
            ],
          },
          {
            id: "rock-gnome",
            name: "Rock Gnome",
            grants: [
              { type: "cantrip", spellId: "mending" },
              { type: "cantrip", spellId: "prestidigitation" },
            ],
          },
        ],
      },
      spellcastingAbility("Gnomish Lineage"),
    ],
  },
  {
    speciesId: "goliath",
    grants: [],
    choices: [
      {
        id: "giant-ancestry",
        name: "Giant Ancestry",
        trait: "Giant Ancestry",
        options: GIANT_ANCESTRY.map(([id, name]) => ({
          id,
          name,
          grants: [{ type: "feature", name }],
        })),
      },
    ],
  },
  { speciesId: "halfling", grants: [], choices: [] },
  {
    speciesId: "human",
    grants: [
      { type: "choose-skill", count: 1 },
      { type: "choose-feat", category: "origin" },
    ],
    choices: [size],
  },
  { speciesId: "orc", grants: [{ type: "darkvision", range: 120 }], choices: [] },
  {
    speciesId: "tiefling",
    grants: [
      { type: "darkvision", range: 60 },
      // Otherworldly Presence; uses the Fiendish Legacy spellcasting ability.
      { type: "cantrip", spellId: "thaumaturgy" },
    ],
    choices: [
      {
        id: "fiendish-legacy",
        name: "Fiendish Legacy",
        trait: "Fiendish Legacy",
        options: [
          {
            id: "abyssal",
            name: "Abyssal",
            grants: [
              { type: "resistance", damageType: "poison" },
              ...lineageSpells("poison-spray", "ray-of-sickness", "hold-person"),
            ],
          },
          {
            id: "chthonic",
            name: "Chthonic",
            grants: [
              { type: "resistance", damageType: "necrotic" },
              ...lineageSpells("chill-touch", "false-life", "ray-of-enfeeblement"),
            ],
          },
          {
            id: "infernal",
            name: "Infernal",
            grants: [
              { type: "resistance", damageType: "fire" },
              ...lineageSpells("fire-bolt", "hellish-rebuke", "darkness"),
            ],
          },
        ],
      },
      spellcastingAbility("Fiendish Legacy"),
      size,
    ],
  },
];
