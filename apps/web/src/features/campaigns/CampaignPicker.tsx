import type { Campaign, UpdateCampaignRequest } from "@dnd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { Ribbon } from "../promo/parts";

const ROLE_LABEL = { gm: "DM", player: "Pemain", spectator: "Penonton" } as const;

export function useCampaigns() {
  return useQuery({ queryKey: ["campaigns"], queryFn: () => api<Campaign[]>("/campaigns") });
}

export function CampaignPicker({ onPick }: { onPick: (id: string) => void }) {
  const campaigns = useCampaigns();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const pickAfter = (c: Campaign) => {
    void qc.invalidateQueries({ queryKey: ["campaigns"] });
    onPick(c.id);
  };
  const create = useMutation({
    mutationFn: () => api<Campaign>("/campaigns", { body: { name } }),
    onSuccess: pickAfter,
  });
  const join = useMutation({
    mutationFn: () => api<Campaign>("/campaigns/join", { body: { inviteCode: code } }),
    onSuccess: pickAfter,
  });

  const submit = (m: { mutate: () => void }) => (e: FormEvent) => {
    e.preventDefault();
    m.mutate();
  };

  return (
    <section className="wrap block camp-picker">
      <Ribbon color="teal">Meja permainan</Ribbon>
      <h1 className="on-wood-title">Pilih campaign</h1>
      {campaigns.isPending && <p className="on-wood">Memuat…</p>}
      {campaigns.error && (
        <p className="on-wood" role="alert">
          {campaigns.error.message}
        </p>
      )}

      {campaigns.data?.length === 0 && (
        <p className="on-wood section-lead">Kamu belum ikut campaign apa pun.</p>
      )}
      <ul className="camp-list">
        {campaigns.data?.map((c) => (
          <li key={c.id} className="camp-item">
            <button type="button" className="camp-card" onClick={() => onPick(c.id)}>
              <span className="camp-name">{c.name}</span>
              <span
                className={`status-tag ${c.role === "gm" ? "status-pending" : "status-accepted"}`}
              >
                {ROLE_LABEL[c.role]}
              </span>
            </button>
            {c.role === "gm" && (
              <details className="camp-promo">
                <summary>Promosi di beranda</summary>
                <PromoForm campaign={c} />
              </details>
            )}
          </li>
        ))}
      </ul>

      <div className="camp-forms">
        <form className="parchment" onSubmit={submit(create)}>
          <div className="parchment-body">
            <h2>Buat campaign</h2>
            <label>
              Nama campaign
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            {create.error && (
              <p className="form-error" role="alert">
                {create.error.message}
              </p>
            )}
            <button type="submit" className="btn btn-teal" disabled={create.isPending}>
              Buat
            </button>
          </div>
        </form>

        <form className="parchment" onSubmit={submit(join)}>
          <div className="parchment-body">
            <h2>Gabung dengan kode</h2>
            <label>
              Kode undangan
              <input value={code} onChange={(e) => setCode(e.target.value)} required />
            </label>
            {join.error && (
              <p className="form-error" role="alert">
                {join.error.message}
              </p>
            )}
            <button type="submit" className="btn btn-plain" disabled={join.isPending}>
              Gabung
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function useUpdateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdateCampaignRequest) =>
      api<Campaign>(`/campaigns/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["public-campaigns"] });
    },
  });
}

/** What a GM writes into the campaign's banner on the public homepage. */
function PromoForm({ campaign }: { campaign: Campaign }) {
  const update = useUpdateCampaign();
  const [promoted, setPromoted] = useState(campaign.settings.promoted);
  const [tagline, setTagline] = useState(campaign.settings.promoTagline);
  const [description, setDescription] = useState(campaign.description);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate({
      id: campaign.id,
      promoted,
      promoTagline: tagline.trim(),
      description: description.trim(),
    });
  };

  return (
    <form className="camp-promo-form" onSubmit={submit}>
      <label className="camp-promo-toggle">
        <input type="checkbox" checked={promoted} onChange={(e) => setPromoted(e.target.checked)} />
        Tampilkan campaign di beranda
      </label>
      <label>
        Sorotan singkat (maks. 140)
        <input
          value={tagline}
          maxLength={140}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Satu kalimat yang bikin orang penasaran"
        />
      </label>
      <label>
        Deskripsi campaign (maks. 2000)
        <textarea
          value={description}
          maxLength={2000}
          rows={4}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ceritakan suasana, aturan rumah, dan jadwal main."
        />
      </label>
      <div className="row">
        <button type="submit" className="btn btn-teal btn-small" disabled={update.isPending}>
          {update.isPending ? "Menyimpan…" : "Simpan promosi"}
        </button>
        {update.isSuccess && <span className="ink-soft">Tersimpan.</span>}
      </div>
      {update.error && (
        <p className="form-error" role="alert">
          {update.error.message}
        </p>
      )}
    </form>
  );
}
