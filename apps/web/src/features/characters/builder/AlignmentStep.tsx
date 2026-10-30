import { ALIGNMENTS } from "../labels";
import type { StepProps } from "./Builder";

/** Step 4: alignment. */
export function AlignmentStep({ build, update }: StepProps) {
  return (
    <div className="stack">
      <h2>Alignment</h2>
      <p className="muted">
        The game assumes player characters aren't evil; check with your GM first.
      </p>
      <div className="cards alignment">
        {ALIGNMENTS.map((a) => (
          <button
            key={a.id}
            className="card"
            aria-pressed={build.alignment === a.id}
            onClick={() => update({ alignment: a.id })}
          >
            {a.name}
          </button>
        ))}
      </div>
    </div>
  );
}
