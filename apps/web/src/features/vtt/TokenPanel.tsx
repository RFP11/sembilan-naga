import {
  MAX_TOKENS_AT_ONCE,
  type CharacterSummary,
  type CreateTokenRequest,
  type MonsterSummary,
  type Token,
  type TokenSize,
} from "@dnd/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { useAddTokens } from "./api";

export const SIZE_LABEL: Record<TokenSize, string> = {
  tiny: "Tiny (½ kotak)",
  small: "Small (1 kotak)",
  medium: "Medium (1 kotak)",
  large: "Large (2×2)",
  huge: "Huge (3×3)",
  gargantuan: "Gargantuan (4×4)",
};
export const SIZES = Object.keys(SIZE_LABEL) as TokenSize[];

type Tab = "monster" | "npc" | "character" | "object";
const TABS: { id: Tab; label: string }[] = [
  { id: "monster", label: "Monster" },
  { id: "npc", label: "NPC" },
  { id: "character", label: "Karakter" },
  { id: "object", label: "Objek" },
];

/** The DM's way of putting tokens on the map that's on the table. */
export function TokenPanel({
  campaignId,
  sceneId,
  tokens,
}: {
  campaignId: string;
  sceneId: string;
  tokens: Token[];
}) {
  const [tab, setTab] = useState<Tab>("monster");
  const add = useAddTokens(campaignId, sceneId);
  const [hidden, setHidden] = useState(false);
  const [count, setCount] = useState(1);

  const submit = (body: CreateTokenRequest) => add.mutate(body);
  const placement = { hidden, count: Math.max(1, Math.min(MAX_TOKENS_AT_ONCE, count || 1)) };

  return (
    <div className="token-panel">
      <h2>Tambah token</h2>
      <div className="calib-zoom token-tabs" role="group" aria-label="Jenis token">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => {
              setTab(t.id);
              add.reset();
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="token-options">
        {tab !== "character" && (
          <label>
            Jumlah
            <input
              type="number"
              min={1}
              max={MAX_TOKENS_AT_ONCE}
              value={count}
              onChange={(e) => setCount(e.target.valueAsNumber)}
            />
          </label>
        )}
        <label className="token-check">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Sembunyikan dari pemain
        </label>
      </div>

      {tab === "monster" && (
        <MonsterPicker
          busy={add.isPending}
          onPick={(monsterId) => submit({ kind: "monster", monsterId, ...placement })}
        />
      )}
      {(tab === "npc" || tab === "object") && (
        <CustomForm
          key={tab}
          kind={tab}
          busy={add.isPending}
          onSubmit={(fields) => submit({ kind: tab, ...fields, ...placement })}
        />
      )}
      {tab === "character" && (
        <CharacterPicker
          campaignId={campaignId}
          tokens={tokens}
          busy={add.isPending}
          onPick={(characterId) => submit({ kind: "character", characterId, hidden })}
        />
      )}

      {add.error && (
        <p className="map-error" role="alert">
          {add.error.message}
        </p>
      )}
    </div>
  );
}

function MonsterPicker({ busy, onPick }: { busy: boolean; onPick: (id: string) => void }) {
  const monsters = useQuery({
    queryKey: ["monster-list"],
    queryFn: () => api<MonsterSummary[]>("/monsters"),
    staleTime: Infinity,
  });
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const matches = (monsters.data ?? [])
    .filter((m) => !query || m.name.toLowerCase().includes(query))
    .slice(0, 40);

  return (
    <>
      <label className="token-search">
        Cari monster SRD
        <input
          type="search"
          placeholder="Goblin, Wolf, Ancient Red Dragon…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {monsters.isPending && <p className="muted">Memuat…</p>}
      {monsters.error && (
        <p className="map-error" role="alert">
          {monsters.error.message}
        </p>
      )}
      {monsters.data && matches.length === 0 && <p className="muted">Tidak ditemukan.</p>}
      <ul className="token-results">
        {matches.map((m) => (
          <li key={m.id}>
            <button type="button" disabled={busy} onClick={() => onPick(m.id)}>
              <b>{m.name}</b>
              <span>
                {m.size[0]} · {m.type} · AC {m.ac} · HP {m.hp}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function CustomForm({
  kind,
  busy,
  onSubmit,
}: {
  kind: "npc" | "object";
  busy: boolean;
  onSubmit: (fields: { name: string; size: TokenSize; hpMax?: number; ac?: number }) => void;
}) {
  const [name, setName] = useState("");
  const [size, setSize] = useState<TokenSize>("medium");
  const [hp, setHp] = useState("");
  const [ac, setAc] = useState("");

  const send = (e: FormEvent) => {
    e.preventDefault();
    const hpMax = Number(hp);
    onSubmit({
      name,
      size,
      ...(hp && hpMax >= 1 ? { hpMax } : {}),
      ...(ac !== "" ? { ac: Number(ac) } : {}),
    });
    setName("");
  };

  return (
    <form className="token-custom" onSubmit={send}>
      <label>
        Nama
        <input
          required
          maxLength={60}
          placeholder={kind === "npc" ? "Kapten Rana" : "Peti harta"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Ukuran
        <select value={size} onChange={(e) => setSize(e.target.value as TokenSize)}>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {SIZE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        HP (opsional)
        <input type="number" min={1} value={hp} onChange={(e) => setHp(e.target.value)} />
      </label>
      <label>
        AC (bawaan 10)
        <input type="number" min={0} max={50} value={ac} onChange={(e) => setAc(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-teal btn-small" disabled={busy}>
        Tambah
      </button>
    </form>
  );
}

function CharacterPicker({
  campaignId,
  tokens,
  busy,
  onPick,
}: {
  campaignId: string;
  tokens: Token[];
  busy: boolean;
  onPick: (id: string) => void;
}) {
  const characters = useQuery({
    queryKey: ["campaign-characters", campaignId],
    queryFn: () => api<CharacterSummary[]>(`/campaigns/${campaignId}/characters`),
  });
  const placed = new Set(tokens.map((t) => t.characterId));

  if (characters.isPending) return <p className="muted">Memuat…</p>;
  if (characters.error) {
    return (
      <p className="map-error" role="alert">
        {characters.error.message}
      </p>
    );
  }
  if (characters.data.length === 0) {
    return <p className="muted">Belum ada karakter yang siap di campaign ini.</p>;
  }
  return (
    <ul className="token-results">
      {characters.data.map((c) => (
        <li key={c.id}>
          <button type="button" disabled={busy || placed.has(c.id)} onClick={() => onPick(c.id)}>
            <b>{c.name}</b>
            <span>{placed.has(c.id) ? "sudah di peta" : `level ${c.level}`}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
