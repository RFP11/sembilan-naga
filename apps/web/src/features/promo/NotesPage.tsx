import type { CampaignNote } from "@dnd/contracts";
import { useState, type FormEvent } from "react";
import { useMe } from "../../lib/auth";
import { Link } from "../../lib/router";
import { Login } from "../auth/Login";
import { useCreateNote, useDeleteNote, useNotes, useUpdateNote } from "./api";
import { PromoShell, Ribbon } from "./parts";

interface Draft {
  sessionNumber: string;
  title: string;
  body: string;
}

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function NotesPage() {
  const me = useMe();
  const user = me.data?.user;
  const notes = useNotes(Boolean(user));

  let content;
  if (me.isPending || (user && notes.isPending)) {
    content = <p className="on-wood">Memuat…</p>;
  } else if (!user) {
    content = (
      <div className="parchment narrow">
        <div className="parchment-body">
          <Login title="Masuk sebagai DM" googleLabel="Masuk dengan Google" />
        </div>
      </div>
    );
  } else if (notes.error || !notes.data) {
    content = (
      <p className="on-wood" role="alert">
        {notes.error?.message ?? "Halaman belum bisa dimuat."}
      </p>
    );
  } else {
    content = <Notebook islands={notes.data.islands} notes={notes.data.notes} />;
  }

  return (
    <PromoShell title="Catatan campaign: Serpih Langit">
      <section className="wrap block">
        <Ribbon color="gold">Khusus DM</Ribbon>
        <h1 className="on-wood-title">Catatan campaign</h1>
        <p className="on-wood section-lead">
          Catatan bersama DM dan co-DM. Setiap pulau punya alur sesinya sendiri, dan pemain tidak
          bisa melihat halaman ini. <Link href="/dm">Kembali ke Halaman DM</Link>
        </p>
        {content}
      </section>
    </PromoShell>
  );
}

function Notebook({
  islands,
  notes,
}: {
  islands: { id: string; name: string }[];
  notes: CampaignNote[];
}) {
  const [islandId, setIslandId] = useState(islands[0]?.id ?? "");
  // Kept per island, so switching to check another island doesn't lose what's being written.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const create = useCreateNote();

  const here = notes.filter((n) => n.islandId === islandId);
  const latestSession = Math.max(0, ...here.map((n) => n.sessionNumber));
  const draft = drafts[islandId] ?? {
    sessionNumber: String(latestSession || 1),
    title: "",
    body: "",
  };
  const setDraft = (next: Draft) => setDrafts((all) => ({ ...all, [islandId]: next }));

  const sessions = [...new Set(here.map((n) => n.sessionNumber))];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const forIsland = islandId;
    create.mutate(
      {
        islandId: forIsland,
        sessionNumber: Number(draft.sessionNumber),
        title: draft.title,
        body: draft.body,
      },
      {
        onSuccess: () =>
          setDrafts((all) => {
            const rest = { ...all };
            delete rest[forIsland];
            return rest;
          }),
      },
    );
  };

  return (
    <>
      <div className="picker" role="group" aria-label="Pilih pulau">
        {islands.map((island) => {
          const count = notes.filter((n) => n.islandId === island.id).length;
          return (
            <button
              key={island.id}
              type="button"
              aria-pressed={island.id === islandId}
              onClick={() => {
                setIslandId(island.id);
                create.reset();
              }}
            >
              {island.name}
              {count > 0 && <span className="note-count"> {count}</span>}
            </button>
          );
        })}
      </div>

      <div className="notes-layout">
        <div className="parchment note-new">
          <div className="parchment-body">
            <h2>Tulis catatan</h2>
            <p className="ink-soft">{islands.find((i) => i.id === islandId)?.name}</p>
            <NoteFields draft={draft} onChange={setDraft} onSubmit={onSubmit}>
              {create.error && (
                <p className="form-error" role="alert">
                  {create.error.message}
                </p>
              )}
              <div className="hero-actions">
                <button type="submit" className="btn btn-red" disabled={create.isPending}>
                  {create.isPending ? "Menyimpan…" : "Simpan catatan"}
                </button>
              </div>
            </NoteFields>
          </div>
        </div>

        <div className="note-sessions">
          {sessions.length === 0 && <p className="on-wood">Belum ada catatan untuk pulau ini.</p>}
          {sessions.map((session) => (
            <section key={session} aria-label={`Sesi ${session}`}>
              <Ribbon color="teal">{`Sesi ${session}`}</Ribbon>
              <div className="note-list">
                {here
                  .filter((n) => n.sessionNumber === session)
                  .map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function NoteFields({
  draft,
  onChange,
  onSubmit,
  children,
}: {
  draft: Draft;
  onChange: (next: Draft) => void;
  onSubmit: (e: FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <form className="reg-form" onSubmit={onSubmit}>
      <div className="note-head-fields">
        <label>
          Sesi
          <input
            type="number"
            min={1}
            max={9999}
            required
            value={draft.sessionNumber}
            onChange={(e) => onChange({ ...draft, sessionNumber: e.target.value })}
          />
        </label>
        <label>
          Judul
          <input
            required
            maxLength={120}
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
          />
        </label>
      </div>
      <label>
        Catatan
        <textarea
          required
          rows={7}
          maxLength={20000}
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
        />
      </label>
      {children}
    </form>
  );
}

function NoteCard({ note }: { note: CampaignNote }) {
  const update = useUpdateNote();
  const remove = useDeleteNote();
  const [editing, setEditing] = useState<Draft | null>(null);
  const edited = note.version > 0;

  if (editing) {
    return (
      <article className="parchment">
        <div className="parchment-body">
          <NoteFields
            draft={editing}
            onChange={setEditing}
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate(
                {
                  id: note.id,
                  sessionNumber: Number(editing.sessionNumber),
                  title: editing.title,
                  body: editing.body,
                  version: note.version,
                },
                { onSuccess: () => setEditing(null) },
              );
            }}
          >
            {update.error && (
              <p className="form-error" role="alert">
                {update.error.message}
              </p>
            )}
            <div className="hero-actions">
              <button type="submit" className="btn btn-red btn-small" disabled={update.isPending}>
                {update.isPending ? "Menyimpan…" : "Simpan"}
              </button>
              <button
                type="button"
                className="btn btn-plain btn-small"
                onClick={() => {
                  setEditing(null);
                  update.reset();
                }}
              >
                Batal
              </button>
            </div>
          </NoteFields>
        </div>
      </article>
    );
  }

  return (
    <article className="parchment">
      <div className="parchment-body">
        <h3>{note.title}</h3>
        <p className="ink-soft note-meta">
          {note.authorName ?? "Tanpa nama"} · {formatTime(note.createdAt)}
          {edited &&
            ` · diubah ${note.updatedByName ?? "tanpa nama"}, ${formatTime(note.updatedAt)}`}
        </p>
        <p className="note-body">{note.body}</p>
        {remove.error && (
          <p className="form-error" role="alert">
            {remove.error.message}
          </p>
        )}
        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-plain btn-small"
            onClick={() =>
              setEditing({
                sessionNumber: String(note.sessionNumber),
                title: note.title,
                body: note.body,
              })
            }
          >
            Ubah
          </button>
          <button
            type="button"
            className="btn btn-plain btn-small"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`Hapus catatan "${note.title}"?`)) remove.mutate(note.id);
            }}
          >
            Hapus
          </button>
        </div>
      </div>
    </article>
  );
}
