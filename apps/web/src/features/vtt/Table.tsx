import { useCampaign } from "../../lib/useCampaign";
import { Board } from "./Board";
import { DiceLog } from "./DiceLog";

// TODO: real campaigns come from the API; "demo" is shared by everyone for now.
const CAMPAIGN_ID = "demo";

export function Table() {
  const joined = useCampaign(CAMPAIGN_ID);

  return (
    <div className="table-layout">
      <section>
        <p className="muted">
          {joined ? "Connected. Drag a token; other tabs see it move." : "Connecting…"}
        </p>
        <Board campaignId={CAMPAIGN_ID} />
      </section>
      <aside>
        <DiceLog campaignId={CAMPAIGN_ID} />
      </aside>
    </div>
  );
}
