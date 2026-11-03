import type { Spell } from "@dnd/data";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { Prose } from "../../lib/Prose";

export function useSpells() {
  return useQuery({
    queryKey: ["spells-all"],
    queryFn: () => api<Spell[]>("/spells"),
    staleTime: Infinity,
  });
}

const levelName = (level: number) => (level === 0 ? "Cantrip" : `Level ${level}`);

function SpellItem({ spell }: { spell: Spell }) {
  return (
    <details className="stat-feature">
      <summary>
        {spell.name}
        {spell.castingTime.includes("Bonus") && <span className="spell-tag"> bonus</span>}
        {spell.castingTime.includes("Reaction") && <span className="spell-tag"> reaksi</span>}
        {spell.concentration && <span className="spell-tag"> C</span>}
        {spell.ritual && <span className="spell-tag"> R</span>}
      </summary>
      <p className="ink-soft spell-meta">
        {spell.castingTime} · {spell.range} · {spell.components.join(", ")}
        {spell.material && ` (${spell.material})`} · {spell.duration}
      </p>
      <Prose text={spell.description} />
      {spell.higherLevels && <Prose text={spell.higherLevels} />}
    </details>
  );
}

/** Spells grouped by level, each opening to its full text. */
export function SpellList({ spells, search = false }: { spells: Spell[]; search?: boolean }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? spells.filter((s) => s.name.toLowerCase().includes(q)) : spells;
  const levels = [...new Set(shown.map((s) => s.level))].sort((a, b) => a - b);

  return (
    <>
      {search && (
        <input
          className="spell-search"
          type="search"
          aria-label="Cari spell"
          placeholder="Cari spell…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {levels.length === 0 && <p className="ink-soft">Tidak ditemukan.</p>}
      {levels.map((level) => (
        <div key={level} className="spell-level">
          <b>{levelName(level)}</b>
          {shown
            .filter((s) => s.level === level)
            .map((s) => (
              <SpellItem key={s.id} spell={s} />
            ))}
        </div>
      ))}
    </>
  );
}

/** The spells named in a monster's Spellcasting, with their full text. */
export function MonsterSpells({ text }: { text: string }) {
  const spells = useSpells();
  if (spells.isPending) return <p className="ink-soft">Memuat spell…</p>;
  if (spells.error) {
    return (
      <p className="form-error" role="alert">
        Spell gagal dimuat: {spells.error.message}
      </p>
    );
  }
  const named = spells.data.filter((s) => {
    const name = s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${name}\\b`).test(text);
  });
  if (named.length === 0) return null;
  return (
    <details className="stat-section" open>
      <summary>Spell ({named.length})</summary>
      <SpellList spells={named} />
    </details>
  );
}
