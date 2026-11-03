import type { Campaign } from "@dnd/contracts";
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
          <li key={c.id}>
            <button type="button" className="camp-card" onClick={() => onPick(c.id)}>
              <span className="camp-name">{c.name}</span>
              <span
                className={`status-tag ${c.role === "gm" ? "status-pending" : "status-accepted"}`}
              >
                {ROLE_LABEL[c.role]}
              </span>
            </button>
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
