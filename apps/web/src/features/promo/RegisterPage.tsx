import { MAX_SHEET_BYTES, type PromoResponse, type Registration } from "@dnd/contracts";
import { useState, type FormEvent } from "react";
import { useMe } from "../../lib/auth";
import { Link } from "../../lib/router";
import { Login } from "../auth/Login";
import { useMyRegistration, usePromo, useSubmitRegistration } from "./api";
import { PromoShell, Ribbon } from "./parts";

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

const STATUS = {
  pending: { label: "Menunggu DM", text: "DM akan meninjau pendaftaranmu." },
  accepted: { label: "Diterima", text: "Selamat datang di Serpih Langit. Sampai jumpa di meja!" },
  rejected: { label: "Belum diterima", text: "DM belum menerima pendaftaran ini." },
} as const;

const CLOSED = "Pendaftaran sedang ditutup.";

export function RegisterPage() {
  const me = useMe();
  const user = me.data?.user;
  const promo = usePromo();
  const mine = useMyRegistration(Boolean(user));

  let content;
  if (me.isPending || promo.isPending || (user && mine.isPending)) {
    content = <p>Memuat…</p>;
  } else if (me.error || promo.error || mine.error) {
    content = <p role="alert">Halaman belum bisa dimuat. Coba muat ulang.</p>;
  } else if (!user) {
    const open = promo.data?.registrationOpen;
    content = (
      <div className="login-box">
        <p>
          {open
            ? "Masuk dulu supaya DM tahu siapa yang mendaftar."
            : `${CLOSED} Sudah pernah mendaftar? Masuk untuk melihat statusmu.`}
        </p>
        <Login title={open ? "Masuk untuk mendaftar" : "Masuk"} googleLabel="Masuk dengan Google" />
      </div>
    );
  } else if (!promo.data?.registrationOpen && !mine.data?.registration) {
    content = <p>{CLOSED}</p>;
  } else if (promo.data) {
    content = (
      <RegisterForm
        promo={promo.data}
        defaultName={user.displayName}
        registration={mine.data?.registration ?? null}
      />
    );
  }

  return (
    <PromoShell title="Daftar: Serpih Langit">
      <section className="wrap block narrow">
        <div className="parchment">
          <div className="parchment-body">
            <Ribbon>Daftar campaign</Ribbon>
            <h1>Bergabung ke Serpih Langit</h1>
            {content}
          </div>
        </div>
      </section>
    </PromoShell>
  );
}

function RegisterForm({
  promo,
  defaultName,
  registration,
}: {
  promo: PromoResponse;
  defaultName: string;
  registration: Registration | null;
}) {
  const submit = useSubmitRegistration();
  const [editing, setEditing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const options = promo.islands.filter((i) => i.start);
  const wanted =
    registration?.startIsland ?? new URLSearchParams(window.location.search).get("pulau");
  const defaultIsland = options.some((i) => i.id === wanted) ? (wanted ?? undefined) : undefined;

  if (registration && !editing) {
    const status = STATUS[registration.status];
    const island = promo.islands.find((i) => i.id === registration.startIsland);
    return (
      <div className="reg-status">
        <p className={`status-tag status-${registration.status}`} role="status">
          {status.label}
        </p>
        <p>
          {status.text}
          {registration.status !== "accepted" &&
            (promo.registrationOpen
              ? registration.status === "rejected" &&
                " Kamu bisa memperbaikinya dan mengirim ulang."
              : ` ${CLOSED} Pendaftaranmu tidak bisa diubah untuk sementara.`)}
        </p>
        <dl>
          <div>
            <dt>Nama</dt>
            <dd>{registration.playerName}</dd>
          </div>
          <div>
            <dt>Karakter</dt>
            <dd>{registration.characterName}</dd>
          </div>
          <div>
            <dt>Pulau awal</dt>
            <dd>{island ? `${island.name} (${island.faction})` : registration.startIsland}</dd>
          </div>
          <div>
            <dt>Character sheet</dt>
            <dd>
              <a href={`/api/promo/registrations/${registration.id}/sheet`}>
                {registration.sheetName}
              </a>
            </dd>
          </div>
        </dl>
        {registration.status === "accepted" ? (
          <Link href="/app" className="btn btn-red">
            Buka meja
          </Link>
        ) : (
          promo.registrationOpen && (
            <button type="button" className="btn btn-plain" onClick={() => setEditing(true)}>
              Ubah pendaftaran
            </button>
          )
        )}
      </div>
    );
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);
    const form = new FormData(e.currentTarget);
    const sheet = form.get("sheet");
    if (sheet instanceof File && sheet.size === 0) form.delete("sheet");
    if (sheet instanceof File && sheet.size > MAX_SHEET_BYTES) {
      setLocalError("File terlalu besar (maksimal 10 MB).");
      return;
    }
    submit.mutate(form, { onSuccess: () => setEditing(false) });
  };

  const error = localError ?? submit.error?.message;
  return (
    <form className="reg-form" onSubmit={onSubmit}>
      <label>
        Nama kamu
        <input
          name="playerName"
          required
          maxLength={80}
          autoComplete="name"
          defaultValue={registration?.playerName ?? defaultName}
        />
      </label>
      <label>
        Nama karakter
        <input
          name="characterName"
          required
          maxLength={80}
          defaultValue={registration?.characterName}
        />
      </label>

      <fieldset>
        <legend>Pulau awal dan faksi</legend>
        <div className="island-options">
          {options.map((island) => (
            <label key={island.id} className="island-option">
              <input
                type="radio"
                name="startIsland"
                value={island.id}
                required
                defaultChecked={island.id === defaultIsland}
              />
              <span>
                <b>{island.name}</b>
                <span className="ink-soft">{island.faction}</span>
                <span>{island.vibe}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label>
        Character sheet
        <input type="file" name="sheet" accept={ACCEPT} required={!registration} />
        <span className="ink-soft field-hint">
          PDF, PNG, JPG, atau WebP, maksimal 10 MB.
          {registration && ` Kosongkan untuk tetap memakai ${registration.sheetName}.`}
        </span>
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="hero-actions">
        <button type="submit" className="btn btn-red" disabled={submit.isPending}>
          {submit.isPending ? "Mengirim…" : "Kirim pendaftaran"}
        </button>
        {registration && (
          <button type="button" className="btn btn-plain" onClick={() => setEditing(false)}>
            Batal
          </button>
        )}
      </div>
    </form>
  );
}
