import type { Token } from "@dnd/contracts";
import { lazy, Suspense } from "react";
import { MonsterStatBlock } from "./MonsterStatBlock";

// Needs the whole SRD data set, so it loads when a character's token is first selected.
const CharacterStatBlock = lazy(() =>
  import("./CharacterStatBlock").then((m) => ({ default: m.CharacterStatBlock })),
);

/** What a selected token can do, for the DM. Players have their own sheet beside the map. */
export function TokenStats({
  token,
  isDm,
  campaignId,
}: {
  token: Token;
  isDm: boolean;
  campaignId: string;
}) {
  let content;
  if (token.monsterId && isDm) {
    content = (
      <MonsterStatBlock
        monsterId={token.monsterId}
        tokenId={token.id}
        campaignId={campaignId}
        tokenName={token.name}
        tokenHidden={token.hidden}
      />
    );
  } else if (token.characterId && isDm) {
    content = (
      <Suspense fallback={<p className="ink-soft">Memuat karakter…</p>}>
        <CharacterStatBlock characterId={token.characterId} campaignId={campaignId} />
      </Suspense>
    );
  } else if (isDm && token.kind === "npc") {
    content = (
      <p className="ink-soft">
        NPC buatan sendiri belum punya stat block. NPC dari SRD seperti Guard, Spy, atau Mage bisa
        ditambahkan lewat tab Monster supaya aksinya ikut tampil.
      </p>
    );
  } else {
    return null;
  }

  return (
    <div className="parchment stat-panel">
      <div className="parchment-body">{content}</div>
    </div>
  );
}
