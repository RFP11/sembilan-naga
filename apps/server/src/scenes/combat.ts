import { deriveCharacter, equippedDefense, weaponAttacks } from "@dnd/character";
import { campaignRoom, type Character, type DamageOption } from "@dnd/contracts";
import { classes } from "@dnd/data";
import { monsters } from "@dnd/data/monsters";
import type { MonsterEntry } from "@dnd/data";
import { applyDamage } from "@dnd/rules";
import { eq, sql } from "drizzle-orm";
import { loadCharacter } from "../characters/repo";
import type { Orm } from "../db";
import { characterState, tokens } from "../db/schema";
import type { IO } from "../plugins/socket";

type TokenRow = typeof tokens.$inferSelect;
export type ReadyCharacter = Character & { state: NonNullable<Character["state"]> };

const DEFAULT_AC = 10;

export const monsterOf = (token: TokenRow) =>
  token.monsterId ? monsters.find((m) => m.id === token.monsterId) : undefined;

/** The numbers combat needs, wherever they live for this kind of token. */
export async function combatStats(orm: Orm, token: TokenRow) {
  const monster = monsterOf(token);
  if (monster) {
    const melee = [...monster.actions, ...monster.reactions].flatMap((e) =>
      e.attack && e.attack.kind !== "ranged" ? [e.attack.reach ?? 5] : [],
    );
    return {
      ac: monster.ac,
      passivePerception: monster.passivePerception as number | null,
      resist: monster.damageResistances as string[],
      vulnerable: monster.damageVulnerabilities as string[],
      immune: monster.damageImmunities as string[],
      /** Squares this token threatens around it; 0 when it has no melee attack at all. */
      reach: melee.length ? Math.floor(Math.max(...melee) / 5) : 0,
      character: null,
    };
  }
  if (token.characterId) {
    const character = await loadCharacter(orm, token.characterId);
    if (character) {
      const derived = deriveCharacter(character.build, equippedDefense(character.items));
      return {
        ac: derived.ac,
        passivePerception: derived.passivePerception as number | null,
        resist: derived.resistances as string[],
        vulnerable: [] as string[],
        immune: [] as string[],
        reach: 1,
        character: character.state ? (character as ReadyCharacter) : null,
      };
    }
  }
  return {
    ac: token.ac ?? DEFAULT_AC,
    passivePerception: null,
    resist: [] as string[],
    vulnerable: [] as string[],
    immune: [] as string[],
    reach: 1,
    character: null,
  };
}

const diceInText = (dice: string) => {
  const [base, sign, modifier] = dice.split(/([+-])/);
  const body = modifier ? `${base} ?\\${sign} ?${modifier}` : (base ?? dice);
  return new RegExp(`\\(${body}\\)`);
};

/**
 * Which of an action's damage applies by default. The stat block lists everything, including
 * "plus 2 (1d4) if the attack roll had Advantage" and "or 18 (4d6 + 4) if ...", which only count
 * sometimes. Those stay available but aren't picked unless the attack had Advantage.
 */
export function damageOptions(entry: MonsterEntry, advantage: boolean): DamageOption[] {
  const options = entry.damage.flatMap((d) => {
    if (!d.dice) return [];
    const match = diceInText(d.dice).exec(entry.description);
    const before = match ? entry.description.slice(0, match.index) : "";
    // Just this damage's own words: up to the next dice, or the end of the sentence.
    const after = match ? entry.description.slice(match.index + match[0].length) : "";
    const clause = after.split(/\(\d+d\d+|\.(?:\s|$)/)[0] ?? "";
    const conditional = / if /.test(clause);
    const needsAdvantage = conditional && /Advantage/.test(clause);
    return [
      {
        dice: d.dice,
        type: d.type as string,
        conditional,
        selected: !conditional || (needsAdvantage && advantage),
        alternative: /,? or \S+$/.test(before.trimEnd()),
      },
    ];
  });
  // "11 (2d6 + 4), or 18 (4d6 + 4) if ...": the second replaces the first.
  return options.map((o, i) => {
    const replacedBy = options[i + 1];
    return {
      dice: o.dice,
      type: o.type,
      conditional: o.conditional,
      selected: o.selected && !(replacedBy?.alternative && replacedBy.selected),
    };
  });
}

/** An action a monster can attack with, by name. */
export function monsterAttack(token: TokenRow, name: string) {
  const monster = monsterOf(token);
  if (!monster) return null;
  const all = [
    ...monster.actions,
    ...monster.bonusActions,
    ...monster.reactions,
    ...monster.legendaryActions,
  ];
  const entry = all.find((e) => e.name === name);
  return entry?.attack ? { entry, toHit: entry.attack.toHit } : null;
}

export async function characterAttack(
  orm: Orm,
  token: TokenRow,
  itemId: string,
  versatile: boolean,
) {
  if (!token.characterId) return null;
  const character = await loadCharacter(orm, token.characterId);
  if (!character) return null;
  const derived = deriveCharacter(character.build, equippedDefense(character.items));
  const attack = weaponAttacks(derived, character.items).find((a) => a.itemId === itemId);
  if (!attack) return null;
  const dice = versatile && attack.versatileDamage ? attack.versatileDamage : attack.damage;
  return {
    name: attack.name,
    toHit: attack.toHit,
    damage: [{ dice, type: attack.damageType, conditional: false, selected: true }],
  };
}

/** What percentage of damage of a type gets through, with the word for why. */
export function damageAfterDefenses(
  amount: number,
  type: string,
  stats: { resist: string[]; vulnerable: string[]; immune: string[] },
): { applied: number; note: string | null } {
  if (stats.immune.includes(type)) return { applied: 0, note: "kebal" };
  if (stats.resist.includes(type)) return { applied: Math.floor(amount / 2), note: "tahan" };
  if (stats.vulnerable.includes(type)) return { applied: amount * 2, note: "rentan" };
  return { applied: amount, note: null };
}

/** Takes damage off a character the same way the sheet does, and tells the table. */
export async function damageCharacter(
  orm: Orm,
  io: IO,
  character: ReadyCharacter,
  amount: number,
  critical: boolean,
) {
  const { state } = character;
  const derived = deriveCharacter(character.build, equippedDefense(character.items));
  const result = applyDamage(
    {
      current: state.hpCurrent,
      temp: state.hpTemp,
      max: derived.maxHp,
      deathSaves: state.deathSaves,
    },
    amount,
    { critical },
  );
  await orm
    .update(characterState)
    .set({
      hpCurrent: result.current,
      hpTemp: result.temp,
      deathSaveSuccess: result.deathSaves.success,
      deathSaveFail: result.deathSaves.fail,
      version: sql`${characterState.version} + 1`,
    })
    .where(eq(characterState.characterId, character.id));
  if (character.campaignId) {
    io.to(campaignRoom(character.campaignId)).emit("character:updated", {
      campaignId: character.campaignId,
      characterId: character.id,
    });
  }
  return result;
}

/** Features people forget they have during a fight. */
const REMEMBER = new Set([
  "Sneak Attack",
  "Cunning Action",
  "Second Wind",
  "Action Surge",
  "Extra Attack",
  "Two Extra Attacks",
  "Three Extra Attacks",
  "Rage",
  "Paladin’s Smite",
  "Lay On Hands",
  "Bardic Inspiration",
  "Channel Divinity",
  "Wild Shape",
  "Flurry of Blows",
  "Hunter’s Prey",
]);

const firstSentence = (text: string) => /^.*?[.!?](\s|$)/s.exec(text)?.[0]?.trim() ?? text;

/** What's easy to forget at the start of this token's turn. */
export function turnReminders(token: TokenRow, character: ReadyCharacter | null) {
  const reminders: {
    type: "recharge" | "trait" | "feature" | "concentration" | "deathSave" | "status";
    title: string;
    detail: string;
  }[] = [];

  const monster = monsterOf(token);
  if (monster) {
    const withRecharge = [...monster.actions, ...monster.bonusActions].filter((e) =>
      /^Recharge \d/.test(e.usage ?? ""),
    );
    for (const e of withRecharge) {
      reminders.push({ type: "recharge", title: e.name, detail: e.usage! });
    }
    for (const t of monster.traits) {
      reminders.push({ type: "trait", title: t.name, detail: t.description });
    }
  }

  if (character) {
    if (character.state.hpCurrent === 0) {
      const { success, fail } = character.state.deathSaves;
      if (fail >= 3) {
        reminders.push({ type: "status", title: "Mati", detail: "3 kali gagal death save." });
      } else if (success >= 3) {
        reminders.push({
          type: "status",
          title: "Stabil",
          detail:
            "HP 0, tidak perlu death save. Pulih 1 HP setelah 1d4 jam, atau saat disembuhkan.",
        });
      } else {
        reminders.push({
          type: "deathSave",
          title: "Death Saving Throw",
          detail: `HP 0: lempar di awal giliran. Sukses ${success}, gagal ${fail}.`,
        });
      }
    }
    if (character.state.concentratingOn) {
      reminders.push({
        type: "concentration",
        title: `Concentration: ${character.state.concentratingOn}`,
        detail: "Masih aktif. Kena damage berarti save CON.",
      });
    }
    const levels = new Map<string, number>();
    for (const l of character.build.levels) {
      levels.set(l.classId, (levels.get(l.classId) ?? 0) + 1);
    }
    for (const [classId, level] of levels) {
      const features = classes.find((c) => c.id === classId)?.features ?? [];
      for (const f of features) {
        if (f.level <= level && REMEMBER.has(f.name)) {
          reminders.push({ type: "feature", title: f.name, detail: firstSentence(f.description) });
        }
      }
    }
  }
  return reminders;
}
