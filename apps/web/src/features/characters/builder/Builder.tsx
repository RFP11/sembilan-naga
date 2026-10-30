import { validateBuild } from "@dnd/character";
import type { BuildIssue, CharacterBuild } from "@dnd/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFinalize, useSaveDraft, type CharacterWithIssues } from "../api";
import { AbilitiesStep } from "./AbilitiesStep";
import { AlignmentStep } from "./AlignmentStep";
import { ClassStep } from "./ClassStep";
import { DetailsStep } from "./DetailsStep";
import { OriginStep } from "./OriginStep";
import { Preview } from "./Preview";

export interface StepProps {
  characterId: string;
  build: CharacterBuild;
  update: (patch: Partial<CharacterBuild>) => void;
}

const STEPS: {
  id: BuildIssue["step"];
  label: string;
  Component: (p: StepProps) => React.ReactNode;
}[] = [
  { id: "class", label: "1. Class", Component: ClassStep },
  { id: "origin", label: "2. Origin", Component: OriginStep },
  { id: "abilities", label: "3. Ability Scores", Component: AbilitiesStep },
  { id: "alignment", label: "4. Alignment", Component: AlignmentStep },
  { id: "details", label: "5. Details", Component: DetailsStep },
];

const SAVE_DELAY = 600;

/** The 5-step character builder. Edits save automatically as a draft. */
export function Builder({
  character,
  onDone,
}: {
  character: CharacterWithIssues;
  onDone: () => void;
}) {
  const [build, setBuild] = useState(character.build);
  const [step, setStep] = useState(Math.min(character.builderStep, STEPS.length));
  const save = useSaveDraft(character.id);
  const finalize = useFinalize(character.id);

  // A server-side roll returns new ability fields; take only those so unsaved edits survive.
  const rolls = character.build.abilityRolls?.join();
  useEffect(() => {
    const { abilityMethod, abilityRolls, baseScores } = character.build;
    setBuild((b) => ({ ...b, abilityMethod, abilityRolls, baseScores }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolls]);

  // Debounced autosave of the build; the step saves right away.
  const pending = useRef<CharacterBuild | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flush = () => {
    clearTimeout(timer.current);
    if (pending.current) save.mutate({ build: pending.current });
    pending.current = null;
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch: Partial<CharacterBuild>) => {
    setBuild((b) => {
      const next = { ...b, ...patch };
      pending.current = next;
      return next;
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  };

  const goTo = (i: number) => {
    flush();
    setStep(i);
    save.mutate({ builderStep: i });
  };

  const issues = useMemo(() => validateBuild(build), [build]);
  const issuesFor = (id: BuildIssue["step"]) => issues.filter((i) => i.step === id);
  const current = STEPS[step];

  return (
    <div className="builder">
      <nav className="steps">
        {STEPS.map((s, i) => (
          <button key={s.id} aria-current={i === step} onClick={() => goTo(i)}>
            {s.label} {issuesFor(s.id).length === 0 ? "✓" : ""}
          </button>
        ))}
        <button aria-current={step === STEPS.length} onClick={() => goTo(STEPS.length)}>
          Finish
        </button>
        <span className="muted save-state">
          {save.isPending ? "Saving…" : save.isError ? `Not saved: ${save.error.message}` : "Saved"}
        </span>
      </nav>

      <section className="builder-main">
        {current ? (
          <>
            <current.Component characterId={character.id} build={build} update={update} />
            <StepIssues issues={issuesFor(current.id)} />
            <div className="row">
              {step > 0 && <button onClick={() => goTo(step - 1)}>Back</button>}
              <button onClick={() => goTo(step + 1)}>Next</button>
            </div>
          </>
        ) : (
          <div className="stack">
            <h2>Finish</h2>
            {issues.length ? (
              <>
                <p>A few things are still missing:</p>
                <ul>
                  {issues.map((i) => (
                    <li key={i.step + i.message}>
                      <button
                        className="link"
                        onClick={() => goTo(STEPS.findIndex((s) => s.id === i.step))}
                      >
                        {STEPS.find((s) => s.id === i.step)!.label}
                      </button>{" "}
                      {i.message}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                Everything is set. Finishing adds your starting equipment and gold and makes the
                character playable.
              </p>
            )}
            <div className="row">
              <button
                className="primary"
                disabled={issues.length > 0 || finalize.isPending}
                onClick={() => {
                  flush();
                  finalize.mutate(undefined, { onSuccess: onDone });
                }}
              >
                Finish character
              </button>
            </div>
            {finalize.error && <p className="error">{finalize.error.message}</p>}
          </div>
        )}
      </section>

      <aside>
        <Preview build={build} />
      </aside>
    </div>
  );
}

function StepIssues({ issues }: { issues: BuildIssue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="issues">
      {issues.map((i) => (
        <li key={i.message}>{i.message}</li>
      ))}
    </ul>
  );
}
