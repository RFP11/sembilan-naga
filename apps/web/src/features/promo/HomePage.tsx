import type { PromotedCampaign } from "@dnd/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { Link } from "../../lib/router";
import { Login } from "../auth/Login";
import { usePublicCampaigns } from "./api";
import { Ribbon, SiteShell } from "./parts";

const FEATURES = [
  {
    title: "Peta & token",
    body: "Peta tempur dengan grid, kabut perang, ukur jarak, ping, dan token yang bisa digeser.",
  },
  {
    title: "Karakter 5e 2024",
    body: "Builder langkah demi langkah dengan data SRD: species, class, background, feat, dan equipment.",
  },
  {
    title: "Character sheet hidup",
    body: "HP, hit dice, death save, spell slot, kondisi, dan inventory yang tersinkron di meja.",
  },
  {
    title: "Dadu 3D",
    body: "Lempar dadu di atas peta; hasilnya masuk ke log kampanye, dan roll DM bisa disembunyikan.",
  },
  {
    title: "Kompendium SRD",
    body: "Monster, spell, item, dan aturan 5e 2024 siap dicari tanpa pindah tab.",
  },
  {
    title: "Catatan DM",
    body: "Catatan per pulau dan sesi, dibagi antar co-DM, dengan pengaman edit bersamaan.",
  },
] as const;

export function HomePage() {
  const me = useMe();
  const campaigns = usePublicCampaigns();
  const user = me.data?.user;

  return (
    <SiteShell title="Meja D&D — meja virtual D&D 5e">
      <section className="wrap hero">
        <div className="parchment hero-card">
          <div className="parchment-body">
            <Ribbon>Meja virtual D&amp;D 5e</Ribbon>
            <h1>Meja D&amp;D</h1>
            <p className="lead">
              Peta &amp; token, character sheet 5e 2024, dadu 3D, kompendium SRD, dan catatan DM —
              semua di satu meja, untuk campaign apa pun.
            </p>
            <div className="hero-actions">
              <Link href="/app" className="btn btn-red">
                {user ? "Buka meja" : "Masuk untuk mulai"}
              </Link>
              <a href="#campaign" className="btn btn-plain">
                Lihat campaign
              </a>
            </div>
          </div>
          <span className="wax-seal" aria-hidden="true">
            MD
          </span>
        </div>
      </section>

      <section className="wrap block">
        <Ribbon color="teal">Yang bisa kamu lakukan</Ribbon>
        <h2>Satu meja untuk seluruh cerita</h2>
        <div className="grid-3 feature-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="parchment">
              <div className="parchment-body">
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="wrap block" id="campaign">
        <Ribbon color="gold">Campaign yang dipromosikan</Ribbon>
        <h2>Cari meja untukmu</h2>
        <p className="on-wood section-lead">
          DM memilih sendiri campaign yang tampil di sini. Punya kode undangan? Langsung gabung di
          bawah.
        </p>

        {campaigns.isPending && <p className="on-wood">Memuat campaign…</p>}
        {campaigns.error && (
          <p className="on-wood" role="alert">
            Campaign belum bisa dimuat: {campaigns.error.message}
          </p>
        )}
        {campaigns.data?.campaigns.length === 0 && (
          <div className="parchment">
            <div className="parchment-body">
              <p>Belum ada campaign yang dipromosikan.</p>
              <p className="ink-soft">
                DM bisa menyalakannya dari meja: buka campaign, lalu Ganti campaign → Promosi di
                beranda.
              </p>
            </div>
          </div>
        )}
        <div className="campaign-banners">
          {campaigns.data?.campaigns.map((campaign) => (
            <CampaignBanner key={campaign.id} campaign={campaign} />
          ))}
        </div>
      </section>

      <section className="wrap block narrow" id="gabung">
        <Ribbon>Gabung ke meja</Ribbon>
        <h2>Punya kode undangan?</h2>
        {user ? (
          <JoinBox />
        ) : (
          <div className="parchment">
            <div className="parchment-body">
              <p className="ink-soft">Masuk dulu supaya kami tahu kamu siapa.</p>
              <Login title="Masuk ke Meja D&D" googleLabel="Masuk dengan Google" />
            </div>
          </div>
        )}
      </section>
    </SiteShell>
  );
}

function CampaignBanner({ campaign }: { campaign: PromotedCampaign }) {
  const focusJoin = () => document.getElementById("gabung")?.scrollIntoView({ behavior: "smooth" });
  return (
    <article className="parchment campaign-banner">
      <div className="parchment-body">
        {campaign.tagline && <p className="banner-tagline">{campaign.tagline}</p>}
        <h3>{campaign.name}</h3>
        {campaign.description && <p className="banner-description">{campaign.description}</p>}
        <p className="banner-meta">
          DM: <b>{campaign.dmName}</b> · {campaign.playerCount} pemain
        </p>
        <div className="hero-actions">
          {campaign.pageUrl && (
            <Link href={campaign.pageUrl} className="btn btn-teal btn-small">
              Lihat campaign
            </Link>
          )}
          {campaign.registrationOpen && (
            <Link href="/daftar" className="btn btn-red btn-small">
              Daftar
            </Link>
          )}
          {!campaign.pageUrl && (
            <button type="button" className="btn btn-plain btn-small" onClick={focusJoin}>
              Gabung dengan kode
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function JoinBox() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const join = useMutation({
    mutationFn: (inviteCode: string) =>
      api<{ name: string }>("/campaigns/join", { body: { inviteCode } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["public-campaigns"] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    join.mutate(code.trim());
  };

  if (join.data) {
    return (
      <div className="parchment join-box">
        <div className="parchment-body">
          <p role="status">
            Kamu sudah gabung ke <b>{join.data.name}</b>.
          </p>
          <Link href="/app" className="btn btn-red">
            Buka meja
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="parchment join-box">
      <div className="parchment-body">
        <form className="promo-form" onSubmit={submit}>
          <label>
            Kode undangan
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
              maxLength={12}
              required
            />
          </label>
          <button type="submit" className="btn btn-teal" disabled={join.isPending}>
            {join.isPending ? "Mencari campaign…" : "Gabung"}
          </button>
        </form>
        {join.error && (
          <p className="form-error" role="alert">
            {join.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
