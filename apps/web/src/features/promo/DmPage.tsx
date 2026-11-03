import type { CampaignDm, CoDmInvite, DmRegistration, MapEra } from "@dnd/contracts";
import { useRef, useState, type FormEvent } from "react";
import { useMe } from "../../lib/auth";
import { Link } from "../../lib/router";
import { Login } from "../auth/Login";
import {
  useCancelCoDmInvite,
  useDm,
  useEraPreview,
  useInviteCoDm,
  useRemoveCoDm,
  useReviewRegistration,
  useSetEra,
  useSetRegistrationOpen,
} from "./api";
import { EraTrack, MapStage, PromoShell, Ribbon } from "./parts";

const ERA_LABELS: Record<MapEra, string> = {
  emas: "Era Emas",
  pertanda: "Era Pertanda",
  senja: "Era Senja",
};
const ERAS = Object.keys(ERA_LABELS) as MapEra[];

const STATUS_LABEL = { pending: "Menunggu", accepted: "Diterima", rejected: "Ditolak" } as const;

export function DmPage() {
  const me = useMe();
  const user = me.data?.user;
  const dm = useDm(Boolean(user));

  let content;
  if (me.isPending || (user && dm.isPending)) {
    content = <p className="on-wood">Memuat…</p>;
  } else if (!user) {
    content = (
      <div className="parchment narrow">
        <div className="parchment-body">
          <Login title="Masuk sebagai DM" googleLabel="Masuk dengan Google" />
        </div>
      </div>
    );
  } else if (dm.error || !dm.data) {
    content = (
      <p className="on-wood" role="alert">
        {dm.error?.message ?? "Halaman belum bisa dimuat."}
      </p>
    );
  } else {
    content = (
      <>
        <RegistrationSwitch open={dm.data.registrationOpen} />
        <EraSettings active={dm.data.era} />
        <Registrations rows={dm.data.registrations} />
        <CoDms dms={dm.data.dms} invites={dm.data.invites} canManage={dm.data.viewerIsOwner} />
      </>
    );
  }

  return (
    <PromoShell title="Halaman DM: Serpih Langit">
      <section className="wrap block">
        <Ribbon color="gold">Khusus DM</Ribbon>
        <h1 className="on-wood-title">Halaman DM</h1>
        {dm.data && (
          <p className="on-wood section-lead">
            <Link href="/dm/catatan">Buka catatan campaign per pulau</Link>
          </p>
        )}
        {content}
      </section>
    </PromoShell>
  );
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

function CoDms({
  dms,
  invites,
  canManage,
}: {
  dms: CampaignDm[];
  invites: CoDmInvite[];
  canManage: boolean;
}) {
  const invite = useInviteCoDm();
  const cancel = useCancelCoDmInvite();
  const remove = useRemoveCoDm();
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const linkInput = useRef<HTMLInputElement>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setCopied(false);
    invite.mutate(email, { onSuccess: () => setEmail("") });
  };
  const copyLink = async () => {
    const input = linkInput.current;
    if (!input) return;
    try {
      await navigator.clipboard.writeText(input.value);
      setCopied(true);
    } catch {
      // Clipboard blocked: select it so it can be copied by hand.
      input.select();
    }
  };
  const error = invite.error ?? cancel.error ?? remove.error;

  return (
    <div className="dm-block">
      <h2>Co-DM</h2>
      <p className="on-wood section-lead">
        Co-DM punya hak yang sama denganmu di halaman ini dan di meja, termasuk melihat data dan
        character sheet semua pendaftar. Hanya pemilik campaign yang bisa mengundang dan mencabut.
      </p>

      <div className="parchment codm-panel">
        <div className="parchment-body">
          <ul className="codm-list">
            {dms.map((dm) => (
              <li key={dm.userId}>
                <span>
                  <b>{dm.displayName}</b>
                  <span className="ink-soft"> {dm.email}</span>
                </span>
                {dm.isOwner ? (
                  <span className="status-tag status-pending">Pemilik</span>
                ) : (
                  <span className="codm-actions">
                    <span className="status-tag status-accepted">Co-DM</span>
                    {canManage && (
                      <button
                        type="button"
                        className="btn btn-plain btn-small"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`Cabut hak co-DM ${dm.displayName}?`)) {
                            remove.mutate(dm.userId);
                          }
                        }}
                      >
                        Cabut
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
            {invites.map((i) => (
              <li key={i.id}>
                <span>
                  <b>{i.email}</b>
                  <span className="ink-soft"> berlaku sampai {formatDate(i.expiresAt)}</span>
                </span>
                <span className="codm-actions">
                  <span className="status-tag status-pending">Diundang</span>
                  {canManage && (
                    <button
                      type="button"
                      className="btn btn-plain btn-small"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(i.id)}
                    >
                      Batalkan
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {canManage && (
            <form className="reg-form codm-form" onSubmit={onSubmit}>
              <label>
                Email Google calon co-DM
                <input
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn-teal" disabled={invite.isPending}>
                {invite.isPending ? "Membuat…" : "Buat link undangan"}
              </button>
            </form>
          )}

          {invite.data && (
            <div className="codm-link" role="status">
              <p>
                <b>Kirim link ini ke {invite.data.invite.email}.</b> Link hanya tampil sekali, hanya
                bisa dipakai akun Google itu, dan berlaku sampai{" "}
                {formatDate(invite.data.invite.expiresAt)}.
              </p>
              <div className="codm-link-row">
                <input
                  ref={linkInput}
                  readOnly
                  aria-label="Link undangan"
                  value={invite.data.link}
                  onFocus={(e) => e.target.select()}
                />
                <button type="button" className="btn btn-plain btn-small" onClick={copyLink}>
                  {copied ? "Tersalin" : "Salin"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RegistrationSwitch({ open }: { open: boolean }) {
  const setOpen = useSetRegistrationOpen();
  return (
    <div className="dm-block">
      <h2>Pendaftaran</h2>
      <p className="on-wood section-lead">
        <span className={`status-tag ${open ? "status-accepted" : "status-rejected"}`}>
          {open ? "Dibuka" : "Ditutup"}
        </span>{" "}
        {open
          ? "Siapa pun yang login bisa mendaftar lewat halaman publik."
          : "Pendaftar baru dan perubahan pendaftaran ditolak. Pendaftar lama tetap bisa melihat statusnya, dan kamu tetap bisa meninjau mereka."}
      </p>
      <button
        type="button"
        className={open ? "btn btn-plain" : "btn btn-teal"}
        disabled={setOpen.isPending}
        onClick={() => setOpen.mutate(!open)}
      >
        {setOpen.isPending ? "Menyimpan…" : open ? "Tutup pendaftaran" : "Buka pendaftaran"}
      </button>
      {setOpen.error && (
        <p className="on-wood" role="alert">
          {setOpen.error.message}
        </p>
      )}
    </div>
  );
}

function EraSettings({ active }: { active: MapEra }) {
  const [chosen, setChosen] = useState<MapEra>(active);
  const [selected, setSelected] = useState("simpang");
  const preview = useEraPreview(chosen, true);
  const setEra = useSetEra();
  const isLive = chosen === active;

  return (
    <div className="dm-block">
      <h2>Era peta</h2>
      <p className="on-wood section-lead">
        Era aktif menentukan peta, teks, dan pilihan pulau awal di halaman publik. Era lain tetap
        tersembunyi dari publik, jadi di sini kamu bisa melihatnya dulu sebelum menerapkannya.
      </p>
      <div className="era-choice" role="radiogroup" aria-label="Pilih era peta">
        {ERAS.map((era) => (
          <button
            key={era}
            type="button"
            role="radio"
            aria-checked={era === chosen}
            onClick={() => {
              setChosen(era);
              setEra.reset();
            }}
          >
            {ERA_LABELS[era]}
            {era === active && <small>aktif</small>}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-red"
          disabled={isLive || setEra.isPending}
          onClick={() => setEra.mutate(chosen)}
        >
          {isLive
            ? `${ERA_LABELS[chosen]} sedang tayang`
            : setEra.isPending
              ? "Menerapkan…"
              : `Terapkan ${ERA_LABELS[chosen]} ke publik`}
        </button>
      </div>
      {setEra.error && (
        <p className="on-wood" role="alert">
          {setEra.error.message}
        </p>
      )}

      {preview.isPending && <p className="on-wood">Memuat pratinjau…</p>}
      {preview.error && (
        <p className="on-wood" role="alert">
          Pratinjau gagal dimuat: {preview.error.message}
        </p>
      )}
      {preview.data && (
        <>
          <EraTrack promo={preview.data} />
          <MapStage promo={preview.data} selected={selected} onSelect={setSelected} />
        </>
      )}
    </div>
  );
}

function Registrations({ rows }: { rows: DmRegistration[] }) {
  const review = useReviewRegistration();
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="dm-block">
      <h2>Pendaftar</h2>
      <p className="on-wood section-lead">
        {rows.length} pendaftar, {pending} menunggu. Pendaftar yang diterima otomatis menjadi pemain
        di campaign.
      </p>
      {review.error && (
        <p className="on-wood" role="alert">
          {review.error.message}
        </p>
      )}
      {rows.length === 0 ? (
        <div className="parchment narrow">
          <div className="parchment-body">
            <p>Belum ada yang mendaftar.</p>
          </div>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="reg-table">
            <thead>
              <tr>
                <th>Pemain</th>
                <th>Karakter</th>
                <th>Pulau awal</th>
                <th>Sheet</th>
                <th>Status</th>
                <th>Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.playerName}</b>
                    <br />
                    <span className="ink-soft">{r.email}</span>
                  </td>
                  <td>{r.characterName}</td>
                  <td>
                    {r.islandName}
                    <br />
                    <span className="ink-soft">{r.factionName}</span>
                  </td>
                  <td>
                    <a href={`/api/promo/registrations/${r.id}/sheet`}>Unduh</a>
                    <br />
                    <span className="ink-soft">{Math.ceil(r.sheetBytes / 1024)} KB</span>
                  </td>
                  <td>
                    <span className={`status-tag status-${r.status}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="reg-actions">
                    {r.status !== "accepted" && (
                      <button
                        type="button"
                        className="btn btn-teal btn-small"
                        disabled={review.isPending}
                        onClick={() => review.mutate({ id: r.id, status: "accepted" })}
                      >
                        Terima
                      </button>
                    )}
                    {r.status !== "rejected" && (
                      <button
                        type="button"
                        className="btn btn-plain btn-small"
                        disabled={review.isPending}
                        onClick={() => review.mutate({ id: r.id, status: "rejected" })}
                      >
                        Tolak
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
