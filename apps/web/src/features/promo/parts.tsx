import type { MapEra, PromoIsland, PromoResponse } from "@dnd/contracts";
import { useEffect, type ReactNode } from "react";
import { useLogout, useMe } from "../../lib/auth";
import { Link } from "../../lib/router";
import { usePromo } from "./api";
import { SkyMap } from "./SkyMap";
import "./promo.css";

/** Gives parchment its torn edge at any size. Needed once on any page that uses parchment. */
export function TornFilter() {
  return (
    <svg className="filters" aria-hidden="true">
      <filter id="torn" x="-3%" y="-3%" width="106%" height="106%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" />
        <feDisplacementMap in="SourceGraphic" scale="9" />
      </filter>
    </svg>
  );
}

/** Page frame: wood header, footer with the required SRD attribution. */
export function PromoShell({ title, children }: { title: string; children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
  const promo = usePromo();
  const user = me.data?.user;

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className="promo">
      <TornFilter />
      <header className="plank-bar">
        <div className="wrap plank-inner">
          <Link href="/" className="brand">
            Serpih Langit
          </Link>
          <nav aria-label="Utama">
            <Link href="/daftar">Daftar</Link>
            {promo.data?.viewerIsGm && <Link href="/dm">Halaman DM</Link>}
            {promo.data?.viewerIsGm && <Link href="/dm/catatan">Catatan</Link>}
            <Link href="/app">{user ? "Buka meja" : "Masuk"}</Link>
            {user && (
              <button type="button" className="link-button" onClick={() => logout.mutate()}>
                Keluar
              </button>
            )}
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="wrap promo-footer">
        <p>Serpih Langit adalah dunia homebrew yang kompatibel dengan 5e.</p>
        <p>
          This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by
          Wizards of the Coast LLC, available at{" "}
          <a href="https://www.dndbeyond.com/srd">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1
          is licensed under the Creative Commons Attribution 4.0 International License, available at{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/legalcode">
            https://creativecommons.org/licenses/by/4.0/legalcode
          </a>
          .
        </p>
      </footer>
    </div>
  );
}

/** Ribbon heading in the campaign's colours. */
export function Ribbon({
  children,
  color = "red",
}: {
  children: ReactNode;
  color?: "red" | "teal" | "olive" | "gold";
}) {
  return <span className={`ribbon ribbon-${color}`}>{children}</span>;
}

export function IslandPanel({ island, eraName }: { island: PromoIsland; eraName: string }) {
  return (
    <div className="parchment island-panel">
      <div className="parchment-body">
        <Ribbon color={island.start ? "teal" : "olive"}>
          {island.start ? "Bisa jadi pulau awal" : "Bukan pulau awal"}
        </Ribbon>
        <h3>{island.name}</h3>
        <p className="ink-soft">
          {island.title} · lapisan {island.layer.toLowerCase()}
        </p>
        <dl>
          <div>
            <dt>Nuansa</dt>
            <dd>{island.vibe}</dd>
          </div>
          <div>
            <dt>Faksi utama</dt>
            <dd>{island.faction}</dd>
          </div>
          <div>
            <dt>Penduduk utama</dt>
            <dd>{island.folk.join(", ")}</dd>
          </div>
          <div>
            <dt>Kabar terbaru</dt>
            <dd className="hook">{island.hook}</dd>
          </div>
          <div className="now">
            <dt>Di {eraName}</dt>
            <dd>{island.now}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

const ERA_ORDER: MapEra[] = ["emas", "pertanda", "senja"];

/** Season track: the era being shown is named, later ones stay locked and nameless. */
export function EraTrack({ promo }: { promo: Pick<PromoResponse, "era" | "eraInfo"> }) {
  const current = ERA_ORDER.indexOf(promo.era);
  return (
    <ol className="era-track" aria-label="Musim campaign">
      {ERA_ORDER.map((era, i) => (
        <li
          key={era}
          className={i === current ? "active" : i < current ? "past" : "locked"}
          aria-current={i === current ? "step" : undefined}
        >
          <span className="hex" aria-hidden="true">
            {i > current ? "?" : i + 1}
          </span>
          <span>{i === current ? promo.eraInfo.name : `Season ${i + 1}`}</span>
        </li>
      ))}
    </ol>
  );
}

export function MapStage({
  promo,
  selected,
  onSelect,
}: {
  promo: PromoResponse;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const island = promo.islands.find((i) => i.id === selected) ?? promo.islands[0]!;
  return (
    <div className="stage">
      <div>
        <div className="wood-frame">
          <SkyMap promo={promo} selected={island.id} onSelect={onSelect} />
        </div>
        <div className="picker" role="group" aria-label="Pilih pulau">
          {promo.islands.map((i) => (
            <button
              key={i.id}
              type="button"
              aria-pressed={i.id === island.id}
              onClick={() => onSelect(i.id)}
            >
              {i.name}
              {i.gone && " (hilang)"}
            </button>
          ))}
        </div>
      </div>
      <IslandPanel island={island} eraName={promo.eraInfo.name} />
    </div>
  );
}
