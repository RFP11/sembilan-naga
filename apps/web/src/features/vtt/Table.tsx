import { useState } from "react";
import { useCampaign } from "../../lib/useCampaign";
import { useCampaigns } from "../campaigns/CampaignPicker";
import type { ComponentProps } from "react";
import { useEncounter, useScenes, useTokens } from "./api";
import { AttackBar, AttackFlowProvider, AttackPanel, useAttackFlow } from "./attackFlow";
import { Board } from "./Board";
import { DiceLog } from "./DiceLog";
import { MapCalibrator } from "./MapCalibrator";
import { MapPanel } from "./MapPanel";
import { PlayerSheet } from "./PlayerSheet";
import { TokenDetails } from "./TokenDetails";
import { TokenPanel } from "./TokenPanel";
import { TokenStats } from "./TokenStats";
import { TurnOrder } from "./TurnOrder";

/** While aiming, a click on a token chooses the target instead of selecting it. */
function AimingBoard(props: Omit<ComponentProps<typeof Board>, "targeting">) {
  const flow = useAttackFlow();
  const aiming = Boolean(flow?.aiming);
  return (
    <Board
      {...props}
      targeting={aiming}
      onSelect={(id) => {
        if (aiming) {
          if (id) flow?.pickTarget(id);
        } else {
          props.onSelect(id);
        }
      }}
    />
  );
}

export function Table({ campaignId }: { campaignId: string }) {
  const joined = useCampaign(campaignId);
  const scenes = useScenes(campaignId);
  const role = useCampaigns().data?.find((c) => c.id === campaignId)?.role;
  const isDm = role === "gm";
  const [calibrating, setCalibrating] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = scenes.data?.scenes ?? [];
  const active = list.find((s) => s.id === scenes.data?.activeSceneId) ?? null;
  const toCalibrate = list.find((s) => s.id === calibrating);
  const { tokens, moveToken } = useTokens(campaignId, active?.id ?? null);
  const selected = tokens.find((t) => t.id === selectedId) ?? null;
  const encounter = useEncounter(campaignId).data?.encounter ?? null;
  const acting = encounter?.combatants.find((c) => c.isCurrent)?.tokenId ?? null;
  // The DM needs the rail to start a fight; players only see one that's running.
  const showRail = Boolean(encounter) || (isDm && Boolean(active));

  if (toCalibrate) {
    return (
      <MapCalibrator
        key={toCalibrate.id}
        campaignId={campaignId}
        scene={toCalibrate}
        onClose={() => setCalibrating(null)}
      />
    );
  }

  const tokenOfCharacter = (characterId: string) =>
    tokens.find((t) => t.characterId === characterId)?.id ?? null;

  return (
    <AttackFlowProvider campaignId={campaignId} tokenOfCharacter={tokenOfCharacter}>
      <div className={showRail ? "table-layout has-rail" : "table-layout"}>
        {showRail && (
          <TurnOrder
            campaignId={campaignId}
            encounter={encounter}
            tokens={tokens}
            isDm={isDm}
            selectedTokenId={selected?.id ?? null}
            onSelectToken={setSelectedId}
          />
        )}
        <section className="table-main">
          <p className="table-status" role="status">
            <span className={joined ? "status-dot on" : "status-dot"} aria-hidden="true" />
            {joined
              ? "Terhubung. Geser token, dan semua yang ada di meja melihatnya bergerak."
              : "Menghubungkan…"}
          </p>
          <AttackBar />
          <AimingBoard
            campaignId={campaignId}
            scene={active}
            tokens={tokens}
            selectedId={selected?.id ?? null}
            actingId={acting}
            onSelect={setSelectedId}
            onMove={moveToken}
          />
          {isDm &&
            (active ? (
              <TokenPanel campaignId={campaignId} sceneId={active.id} tokens={tokens} />
            ) : (
              <p className="muted token-hint">Tayangkan peta dulu untuk menambah token.</p>
            ))}
          {isDm && (
            <MapPanel
              campaignId={campaignId}
              scenes={list}
              activeSceneId={scenes.data?.activeSceneId ?? null}
              onCalibrate={setCalibrating}
            />
          )}
        </section>
        <aside className="table-side">
          <AttackPanel />
          {selected && (
            <TokenDetails
              key={selected.id}
              campaignId={campaignId}
              token={selected}
              isDm={isDm}
              onClose={() => setSelectedId(null)}
            />
          )}
          {selected && (
            <TokenStats
              key={`stats-${selected.id}`}
              token={selected}
              isDm={isDm}
              campaignId={campaignId}
            />
          )}
          {role && !isDm && (
            <PlayerSheet
              campaignId={campaignId}
              focusCharacterId={selected?.canMove ? selected.characterId : null}
            />
          )}
          <DiceLog campaignId={campaignId} />
        </aside>
      </div>
    </AttackFlowProvider>
  );
}
