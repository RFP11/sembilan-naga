import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { useCharacter, useCreateCharacter, useDeleteCharacter, useMyCharacters } from "./api";
import { Builder } from "./builder/Builder";
import { CharacterView } from "./CharacterView";
import { classSummary, speciesName } from "./labels";

/** The Characters tab: your characters, the builder for drafts, a summary for ready ones. */
export function CharactersPage({ campaignId }: { campaignId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (openId) return <OpenCharacter id={openId} onBack={() => setOpenId(null)} />;
  return <CharacterList campaignId={campaignId} onOpen={setOpenId} />;
}

function CharacterList({
  campaignId,
  onOpen,
}: {
  campaignId: string;
  onOpen: (id: string) => void;
}) {
  const list = useMyCharacters();
  const create = useCreateCharacter();
  const remove = useDeleteCharacter();
  const qc = useQueryClient();

  const moveHere = async (id: string) => {
    await api(`/characters/${id}`, { method: "PATCH", body: { campaignId } });
    await qc.invalidateQueries({ queryKey: ["characters"] });
  };

  return (
    <div className="stack narrow">
      <div className="row">
        <h2 className="grow">Your characters</h2>
        <button
          className="primary"
          disabled={create.isPending}
          onClick={() => create.mutate(campaignId, { onSuccess: (c) => onOpen(c.id) })}
        >
          New character
        </button>
      </div>
      {create.error && <p className="error">{create.error.message}</p>}
      {list.isPending && <p className="muted">Loading…</p>}
      {list.error && <p className="error">{list.error.message}</p>}
      {list.data?.length === 0 && <p className="muted">No characters yet.</p>}
      <ul className="stack">
        {list.data?.map((c) => (
          <li key={c.id} className="list-row">
            <button className="grow" onClick={() => onOpen(c.id)}>
              <strong>{c.name || "Unnamed"}</strong>{" "}
              <span className="muted">
                {[speciesName(c.speciesId), classSummary(c.classes)].filter(Boolean).join(" · ")}
              </span>{" "}
              {c.status === "draft" && <span className="badge">draft</span>}
              {c.campaignId !== campaignId && (
                <span className="badge">{c.campaignId ? "other campaign" : "no campaign"}</span>
              )}
            </button>
            {c.status === "ready" && c.campaignId !== campaignId && (
              <button onClick={() => void moveHere(c.id)}>Move here</button>
            )}
            <button
              onClick={() => {
                if (confirm(`Delete ${c.name || "this character"}? This can't be undone.`))
                  remove.mutate(c.id);
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OpenCharacter({ id, onBack }: { id: string; onBack: () => void }) {
  const character = useCharacter(id);
  return (
    <div className="stack">
      <div>
        <button onClick={onBack}>← Characters</button>
      </div>
      {character.isPending && <p className="muted">Loading…</p>}
      {character.error && <p className="error">{character.error.message}</p>}
      {character.data &&
        (character.data.status === "draft" ? (
          <Builder character={character.data} onDone={() => void character.refetch()} />
        ) : (
          <CharacterView character={character.data} />
        ))}
    </div>
  );
}
