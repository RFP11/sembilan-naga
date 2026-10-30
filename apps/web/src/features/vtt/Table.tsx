import { useCampaign } from "../../lib/useCampaign";
import { Board } from "./Board";
import { DiceLog } from "./DiceLog";

export function Table({ campaignId }: { campaignId: string }) {
  const joined = useCampaign(campaignId);

  return (
    <div className="table-layout">
      <section>
        <p className="muted">
          {joined ? "Connected. Drag a token; other tabs see it move." : "Connecting…"}
        </p>
        <Board campaignId={campaignId} />
      </section>
      <aside>
        <DiceLog campaignId={campaignId} />
      </aside>
    </div>
  );
}
