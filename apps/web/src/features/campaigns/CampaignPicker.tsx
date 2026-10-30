import type { Campaign } from "@dnd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../../lib/api";

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
    <div className="centered">
      <h1>Campaigns</h1>
      {campaigns.isPending && <p className="muted">Loading…</p>}
      {campaigns.error && <p className="error">{campaigns.error.message}</p>}
      <ul className="stack">
        {campaigns.data?.map((c) => (
          <li key={c.id}>
            <button onClick={() => onPick(c.id)}>
              {c.name} <span className="muted">{c.role === "gm" ? "GM" : c.role}</span>
            </button>
          </li>
        ))}
        {campaigns.data?.length === 0 && <li className="muted">You're not in any campaign yet.</li>}
      </ul>

      <form className="row" onSubmit={submit(create)}>
        <input
          placeholder="New campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button type="submit" disabled={create.isPending}>
          Create
        </button>
      </form>
      {create.error && <p className="error">{create.error.message}</p>}

      <form className="row" onSubmit={submit(join)}>
        <input
          placeholder="Invite code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button type="submit" disabled={join.isPending}>
          Join
        </button>
      </form>
      {join.error && <p className="error">{join.error.message}</p>}
    </div>
  );
}
