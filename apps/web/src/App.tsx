import { useState } from "react";
import { CharacterSheet } from "./features/character-sheet/CharacterSheet";
import { Compendium } from "./features/compendium/Compendium";
import { Table } from "./features/vtt/Table";

const TABS = {
  vtt: { label: "Table", Component: Table },
  sheet: { label: "Character", Component: CharacterSheet },
  compendium: { label: "Compendium", Component: Compendium },
} as const;

type Tab = keyof typeof TABS;

export function App() {
  const [tab, setTab] = useState<Tab>("vtt");
  const { Component } = TABS[tab];

  return (
    <div className="app">
      <header className="topbar">
        <strong>DnD App</strong>
        <nav>
          {(Object.keys(TABS) as Tab[]).map((key) => (
            <button key={key} aria-current={key === tab} onClick={() => setTab(key)}>
              {TABS[key].label}
            </button>
          ))}
        </nav>
      </header>
      <main>
        <Component />
      </main>
    </div>
  );
}
