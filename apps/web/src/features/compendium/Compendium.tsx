import type { Spell } from "@dnd/data";
import { useQuery } from "@tanstack/react-query";

export function Compendium() {
  const { data, isPending, error } = useQuery({
    queryKey: ["spells"],
    queryFn: async (): Promise<Spell[]> => {
      const res = await fetch("/api/spells");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  if (isPending) return <p className="muted">Loading…</p>;
  if (error) return <p>Failed to load: {error.message}</p>;

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: 700 }}>
      {data.map((s) => (
        <article key={s.id}>
          <h3 style={{ marginBottom: 0 }}>{s.name}</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {s.level === 0 ? "Cantrip" : `Level ${s.level}`} · {s.school} · {s.castingTime} ·{" "}
            {s.range}
          </p>
          <p>{s.description}</p>
        </article>
      ))}
    </div>
  );
}
