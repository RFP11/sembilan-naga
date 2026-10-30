import { z } from "zod";
import spellsJson from "./srd/spells.json";

// SRD content (CC-BY-4.0). Validated at import time so bad data fails loudly in tests/CI.

export const spellSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.number().int().min(0).max(9),
  school: z.enum([
    "abjuration",
    "conjuration",
    "divination",
    "enchantment",
    "evocation",
    "illusion",
    "necromancy",
    "transmutation",
  ]),
  castingTime: z.string(),
  range: z.string(),
  components: z.array(z.enum(["V", "S", "M"])),
  duration: z.string(),
  classes: z.array(z.string()),
  description: z.string(),
});
export type Spell = z.infer<typeof spellSchema>;

export const spells: Spell[] = z.array(spellSchema).parse(spellsJson);

export const SRD_ATTRIBUTION =
  "This work includes material from the System Reference Document 5.2 by Wizards of the Coast LLC, " +
  "licensed under CC-BY-4.0 (https://creativecommons.org/licenses/by/4.0/legalcode).";
