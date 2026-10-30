import { z } from "zod";
import * as s from "./schemas";
import abilitiesJson from "./srd/abilities.json";
import armorJson from "./srd/armor.json";
import backgroundsJson from "./srd/backgrounds.json";
import classesJson from "./srd/classes.json";
import conditionsJson from "./srd/conditions.json";
import damageTypesJson from "./srd/damage-types.json";
import featsJson from "./srd/feats.json";
import gearJson from "./srd/gear.json";
import glossaryJson from "./srd/glossary.json";
import languagesJson from "./srd/languages.json";
import magicItemsJson from "./srd/magic-items.json";
import skillsJson from "./srd/skills.json";
import speciesJson from "./srd/species.json";
import spellsJson from "./srd/spells.json";
import toolsJson from "./srd/tools.json";
import weaponMasteriesJson from "./srd/weapon-masteries.json";
import weaponPropertiesJson from "./srd/weapon-properties.json";
import weaponsJson from "./srd/weapons.json";

// SRD 5.2.1 content (CC-BY-4.0), generated from rule-book/SRD_CC_v5.2.1.pdf by scripts/
// ("pnpm --filter @dnd/data srd:extract" then "srd:build"). Fix the parser, not the JSON.
// Validated at import time so bad data fails loudly in tests/CI.

export * from "./schemas";

const list = <T extends z.ZodType>(schema: T, data: unknown): z.infer<T>[] =>
  z.array(schema).parse(data);

export const abilities = list(s.ability, abilitiesJson);
export const skills = list(s.skill, skillsJson);
export const damageTypes = list(s.damageType, damageTypesJson);
export const conditions = list(s.condition, conditionsJson);
export const languages = list(s.language, languagesJson);
export const glossary = list(s.rule, glossaryJson);

export const weapons = list(s.weapon, weaponsJson);
export const weaponProperties = list(s.rule, weaponPropertiesJson);
export const weaponMasteries = list(s.rule, weaponMasteriesJson);
export const armor = list(s.armor, armorJson);
export const tools = list(s.tool, toolsJson);
export const gear = list(s.gear, gearJson);
export const magicItems = list(s.magicItem, magicItemsJson);

export const spells = list(s.spell, spellsJson);
export const species = list(s.species, speciesJson);
export const backgrounds = list(s.background, backgroundsJson);
export const feats = list(s.feat, featsJson);
export const classes = list(s.dndClass, classesJson);

export const SRD_ATTRIBUTION =
  "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of " +
  "the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the " +
  "Creative Commons Attribution 4.0 International License, available at " +
  "https://creativecommons.org/licenses/by/4.0/legalcode.";
