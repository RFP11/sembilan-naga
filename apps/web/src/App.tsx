import { lazy, Suspense, useState, type ComponentType } from "react";
import { Login } from "./features/auth/Login";
import { CampaignPicker, useCampaigns } from "./features/campaigns/CampaignPicker";
import { Compendium } from "./features/compendium/Compendium";
import { Table } from "./features/vtt/Table";
import { useLogout, useMe } from "./lib/auth";

// The characters feature pulls in the whole SRD data set, so it loads on first use.
const CharactersPage = lazy(() =>
  import("./features/characters/CharactersPage").then((m) => ({ default: m.CharactersPage })),
);

type Tab = "vtt" | "characters" | "compendium";

const TABS: Record<Tab, { label: string; Component: ComponentType<{ campaignId: string }> }> = {
  vtt: { label: "Table", Component: Table },
  characters: { label: "Characters", Component: CharactersPage },
  compendium: { label: "Compendium", Component: Compendium },
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

export function App() {
  const me = useMe();
  if (me.isPending) return <p className="muted centered">Loading…</p>;
  if (me.error) return <p className="error centered">Can't reach the server: {me.error.message}</p>;
  if (!me.data.user) return <Login />;
  return <LoggedIn displayName={me.data.user.displayName} />;
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
    return campaigns.isPending ? (
      <p className="muted centered">Loading…</p>
    ) : (
      <CampaignPicker onPick={pick} />
    );
  }

  const { Component } = TABS[tab];
  return (
    <div className="app">
      <header className="topbar">
        <strong>{campaign.name}</strong>
        <nav>
          {(Object.keys(TABS) as Tab[]).map((key) => (
            <button key={key} aria-current={key === tab} onClick={() => setTab(key)}>
              {TABS[key].label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {campaign.inviteCode && <span className="muted">Invite: {campaign.inviteCode}</span>}
        <button onClick={() => pick(null)}>Campaigns</button>
        <span className="muted">{displayName}</span>
        <button onClick={() => logout.mutate()}>Log out</button>
      </header>
      <main>
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Component campaignId={campaign.id} />
        </Suspense>
      </main>
    </div>
  );
}
