import type { MapEra, PromoResponse } from "@dnd/contracts";

// The sky map from the Serpih Langit world page: an image per island over an era background,
// all on a 1600x893 canvas. Era text and island offsets come from the server.

type Box = { x: number; y: number; w: number; h: number };

const SPRITES: Record<string, Box> = {
  solmara: { x: 652, y: 10, w: 308, h: 396 },
  pasar: { x: 22, y: 322, w: 384, h: 348 },
  simpang: { x: 420, y: 274, w: 390, h: 446 },
  karang: { x: 870, y: 304, w: 336, h: 416 },
  rimba: { x: 1220, y: 247, w: 356, h: 451 },
  badai: { x: 192, y: 574, w: 334, h: 272 },
  nadir: { x: 1104, y: 608, w: 272, h: 258 },
  shipA: { x: 330, y: 218, w: 160, h: 150 },
  shipB: { x: 1035, y: 190, w: 115, h: 98 },
};

/** Island centre (route ends), label, crystal glow and click area on the canvas. */
const GEO: Record<
  string,
  {
    c: [number, number];
    lbl: [number, number];
    glow: [number, number] | null;
    hit: [number, number, number, number];
  }
> = {
  solmara: { c: [805, 200], lbl: [905, 368], glow: [805, 352], hit: [805, 195, 140, 185] },
  pasar: { c: [200, 470], lbl: [205, 312], glow: [178, 612], hit: [215, 495, 180, 165] },
  simpang: { c: [615, 480], lbl: [556, 744], glow: [612, 664], hit: [615, 500, 185, 215] },
  karang: { c: [1035, 490], lbl: [1015, 744], glow: [1040, 664], hit: [1038, 510, 160, 198] },
  rimba: { c: [1400, 470], lbl: [1468, 714], glow: [1415, 636], hit: [1398, 468, 170, 212] },
  badai: { c: [360, 700], lbl: [362, 866], glow: null, hit: [360, 710, 155, 128] },
  nadir: { c: [1240, 720], lbl: [1240, 880], glow: null, hit: [1240, 735, 128, 120] },
};

const LOOK: Record<MapEra, { glow: number; mist: number; sun: number }> = {
  emas: { glow: 0.9, mist: 0.3, sun: 1 },
  pertanda: { glow: 0.45, mist: 0.5, sun: 0.7 },
  senja: { glow: 0.22, mist: 0.6, sun: 0.45 },
};

const FEUD = ["karang", "rimba"] as const;
const FEUD_MARK_X = 1213;

export function SkyMap({
  promo,
  selected,
  onSelect,
}: {
  promo: Pick<PromoResponse, "era" | "islands" | "routes">;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const { era, islands, routes } = promo;
  const look = LOOK[era];
  const offset = (id: string) => islands.find((i) => i.id === id)?.offset ?? 0;
  const at = (id: string): [number, number] => {
    const [x, y] = GEO[id]!.c;
    return [x, y + offset(id)];
  };
  const src = (name: string) => `/api/promo/map/${era}-${name}.webp`;
  const sprite = (name: string, className?: string) => {
    const box = SPRITES[name]!;
    return (
      <image
        className={className}
        href={src(name)}
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
      />
    );
  };

  const [feudA, feudB] = [at(FEUD[0]), at(FEUD[1])];
  const feudT = (FEUD_MARK_X - feudA[0]) / (feudB[0] - feudA[0]);

  return (
    <svg
      className="sky-map"
      viewBox="0 0 1600 893"
      role="group"
      aria-label={`Peta langit Serpih Langit, ${era}`}
    >
      <defs>
        <radialGradient id="crystal-glow">
          <stop offset="0" stopColor="#ffe7a0" stopOpacity=".95" />
          <stop offset=".35" stopColor="#ffc85a" stopOpacity=".45" />
          <stop offset="1" stopColor="#ffb030" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sun-glow">
          <stop offset=".35" stopColor="#fff" stopOpacity="0" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id="mist-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
      </defs>

      <image href={src("bg")} x="0" y="0" width="1600" height="893" preserveAspectRatio="none" />
      <g className="sun-pulse" style={{ mixBlendMode: "screen", opacity: look.sun }}>
        <circle cx="1312" cy="152" r="150" fill="url(#sun-glow)" />
      </g>
      <g className="ship ship-a">
        <g className="ship-bob">{sprite("shipA")}</g>
      </g>
      <g className="ship ship-b">
        <g className="ship-bob">{sprite("shipB")}</g>
      </g>

      <g fill="none" stroke="rgba(255,255,255,.75)" strokeWidth="3" strokeDasharray="10 10">
        {routes.map(([a, b]) => {
          const [from, to] = [at(a), at(b)];
          const opacity = Math.max(0, 1 - Math.max(offset(a), offset(b)) / 150);
          if (!opacity) return null;
          return (
            <line
              key={`${a}-${b}`}
              x1={from[0]}
              y1={from[1]}
              x2={to[0]}
              y2={to[1]}
              opacity={opacity}
            />
          );
        })}
      </g>
      <line
        x1={feudA[0]}
        y1={feudA[1]}
        x2={feudB[0]}
        y2={feudB[1]}
        stroke="#ff7a4a"
        strokeWidth="3.5"
        strokeDasharray="6 9"
      />

      {islands
        .filter((island) => !island.gone && GEO[island.id])
        .map((island, i) => {
          const geo = GEO[island.id]!;
          const fade = Math.max(0, Math.min(1, 1 - (island.offset - 110) / 160));
          return (
            <g key={island.id} transform={`translate(0 ${island.offset})`} opacity={fade}>
              <g className="island-bob" style={{ animationDelay: `${-i * 1.1}s` }}>
                <g
                  className={island.id === selected ? "island selected" : "island"}
                  role="button"
                  tabIndex={0}
                  aria-label={`${island.name}, lapisan ${island.layer}`}
                  aria-pressed={island.id === selected}
                  onClick={() => onSelect(island.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(island.id);
                    }
                  }}
                >
                  {sprite(island.id, "island-img")}
                  {geo.glow && (
                    <g
                      style={{
                        mixBlendMode: "screen",
                        opacity: island.id === "solmara" ? 0.95 : look.glow,
                      }}
                    >
                      <circle
                        className="crystal"
                        cx={geo.glow[0]}
                        cy={geo.glow[1]}
                        r="62"
                        fill="url(#crystal-glow)"
                      />
                    </g>
                  )}
                  <ellipse
                    className="island-hit"
                    cx={geo.hit[0]}
                    cy={geo.hit[1]}
                    rx={geo.hit[2]}
                    ry={geo.hit[3]}
                  />
                </g>
              </g>
              <text className="island-name" x={geo.lbl[0]} y={geo.lbl[1]} textAnchor="middle">
                {island.name}
              </text>
            </g>
          );
        })}

      <g transform={`translate(${FEUD_MARK_X} ${feudA[1] + (feudB[1] - feudA[1]) * feudT})`}>
        <title>Karang Besi dan Rimbaraya berselisih: tidak ada rute langsung</title>
        <circle r="20" fill="#2a1420" stroke="#ff7a4a" strokeWidth="3" />
        <path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#ff9a70" strokeWidth="4" strokeLinecap="round" />
      </g>

      <g filter="url(#mist-blur)" opacity={look.mist}>
        <g className="mist-drift" fill="#eef1f7">
          <ellipse cx="160" cy="880" rx="300" ry="46" />
          <ellipse cx="620" cy="895" rx="340" ry="50" />
          <ellipse cx="1080" cy="880" rx="320" ry="46" />
          <ellipse cx="1500" cy="892" rx="300" ry="50" />
        </g>
      </g>
    </svg>
  );
}
