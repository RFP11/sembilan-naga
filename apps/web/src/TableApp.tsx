import { lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { Login } from "./features/auth/Login";
import { CampaignPicker, useCampaigns } from "./features/campaigns/CampaignPicker";
import { Compendium } from "./features/compendium/Compendium";
import { SiteShell, TornFilter } from "./features/promo/parts";
import { Table } from "./features/vtt/Table";
import { useLogout, useMe } from "./lib/auth";
import { Link } from "./lib/router";
import "./tavern.css";

// The characters feature pulls in the whole SRD data set, so it loads on first use.
const CharactersPage = lazy(() =>
  import("./features/characters/CharactersPage").then((m) => ({ default: m.CharactersPage })),
);

type Tab = "vtt" | "characters" | "compendium";

const TABS: Record<Tab, { label: string; Component: ComponentType<{ campaignId: string }> }> = {
  vtt: { label: "Meja", Component: Table },
  characters: { label: "Karakter", Component: CharactersPage },
  compendium: { label: "Kompendium", Component: Compendium },
};

const LAST_CAMPAIGN = "dnd:last-campaign";
const readLast = () => {
  try {
    return localStorage.getItem(LAST_CAMPAIGN);
  } catch {
    return null;
  }
};
const writeLast = (id: string | null) => {
  try {
    if (id) localStorage.setItem(LAST_CAMPAIGN, id);
    else localStorage.removeItem(LAST_CAMPAIGN);
  } catch {
    // storage unavailable (private mode); the choice just isn't remembered
  }
};

export function TableApp() {
  const me = useMe();
  if (me.isPending) return <Entrance>Memuat…</Entrance>;
  if (me.error) return <Entrance>Server tidak bisa dihubungi: {me.error.message}</Entrance>;
  if (!me.data.user) {
    return (
      <Entrance>
        <Login title="Masuk ke meja" googleLabel="Masuk dengan Google" />
      </Entrance>
    );
  }
  return <LoggedIn displayName={me.data.user.displayName} />;
}

/** The way in, before a campaign is open: the same frame as the public pages. */
function Entrance({ children }: { children: ReactNode }) {
  return (
    <SiteShell title="Meja D&D">
      <section className="wrap block narrow">
        <div className="parchment">
          <div className="parchment-body">{children}</div>
        </div>
      </section>
    </SiteShell>
  );
}

function LoggedIn({ displayName }: { displayName: string }) {
  const [tab, setTab] = useState<Tab>("vtt");
  const [campaignId, setCampaignId] = useState<string | null>(readLast);
  const campaigns = useCampaigns();
  const logout = useLogout();

  const pick = (id: string | null) => {
    setCampaignId(id);
    writeLast(id);
  };

  const campaign = campaigns.data?.find((c) => c.id === campaignId);
  if (!campaign) {
    return (
      <SiteShell title="Meja D&D: pilih campaign">
        {campaigns.isPending ? (
          <p className="wrap block on-wood">Memuat…</p>
        ) : (
          <CampaignPicker onPick={pick} />
        )}
      </SiteShell>
    );
  }

  const { Component } = TABS[tab];
  return (
    <div className="promo tavern">
      <TornFilter />
      <header className="plank-bar">
        <div className="wrap plank-inner">
          <Link href="/" className="brand" title="Ke halaman depan">
            {campaign.name}
          </Link>
          <nav className="tab-bar" aria-label="Bagian meja">
            {(Object.keys(TABS) as Tab[]).map((key) => (
              <button key={key} aria-current={key === tab} onClick={() => setTab(key)}>
                {TABS[key].label}
              </button>
            ))}
          </nav>
          <span className="spacer" />
          <nav aria-label="Akun">
            {campaign.inviteCode && (
              <span className="invite-code" title="Kode untuk masuk ke campaign ini">
                Kode: <b>{campaign.inviteCode}</b>
              </span>
            )}
            <button type="button" className="link-button" onClick={() => pick(null)}>
              Ganti campaign
            </button>
            <span className="tavern-user">{displayName}</span>
            <button type="button" className="link-button" onClick={() => logout.mutate()}>
              Keluar
            </button>
          </nav>
        </div>
      </header>
      <main className="wrap tavern-main">
        <Suspense fallback={<p className="muted">Memuat…</p>}>
          <Component campaignId={campaign.id} />
        </Suspense>
      </main>
    </div>
  );
}
