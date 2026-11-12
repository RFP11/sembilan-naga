import type { DiceRollResult } from "@dnd/contracts";
import { useEffect, useRef, useState } from "react";
import { useMe } from "../../lib/auth";
import { socket } from "../../lib/socket";
import type { DiceScene } from "./DiceScene";
import { dieThrows } from "./throws";
import { getDiceSettings, useDiceSettings } from "./settings";
import { unlockAudio } from "./sound";

interface Landed {
  id: string;
  by: string;
  total: number;
}

/**
 * Every roll at the table tumbles across the map as 3D dice, in the roller's colour. The DM's
 * secret rolls never reach players' screens, so they only tumble for the DMs. three.js and the
 * models load the first time they are needed.
 */
export function DiceOverlay({ campaignId }: { campaignId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Promise<DiceScene> | null>(null);
  const { animate, sound } = useDiceSettings();
  const myColor = useMe().data?.user?.diceColor ?? "gold";
  const [landed, setLanded] = useState<Landed[]>([]);

  // Sound needs a click first; any click on the page will do.
  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useEffect(
    () => () => {
      void scene.current?.then((s) => s.dispose());
      scene.current = null;
    },
    [],
  );

  // Fetch the models and our own colour in a quiet moment, so our first throw isn't late.
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(
      () => void import("./DiceScene").then((m) => m.preloadDice(myColor)),
      1500,
    );
    return () => clearTimeout(t);
  }, [animate, myColor]);

  useEffect(() => {
    void scene.current?.then((s) => (s.sound = sound));
  }, [sound]);

  useEffect(() => {
    if (!animate) return;
    const onRolled = (r: DiceRollResult) => {
      if (r.campaignId !== campaignId || !host.current) return;
      const dice = dieThrows(r.expression, r.rolls);
      if (!dice) return;
      const el = host.current;
      scene.current ??= import("./DiceScene").then((m) => new m.DiceScene(el));
      scene.current
        .then((s) => {
          s.sound = getDiceSettings().sound;
          return s.throw(dice, r.color ?? "gold", () => {
            setLanded((prev) => [...prev, { id: r.id, by: r.by, total: r.total }]);
            setTimeout(() => setLanded((prev) => prev.filter((l) => l.id !== r.id)), 2800);
          });
        })
        .catch((err: unknown) => {
          // No WebGL, or the models failed to load: the dice log still has every roll.
          console.warn("3D dice unavailable", err);
          scene.current = null;
        });
    };
    socket.on("dice:rolled", onRolled);
    return () => {
      socket.off("dice:rolled", onRolled);
    };
  }, [campaignId, animate]);

  return (
    <div ref={host} className="dice-overlay" aria-hidden="true">
      {landed.length > 0 && (
        <ul className="dice-landed">
          {landed.map((l) => (
            <li key={l.id}>
              {l.by} <b>{l.total}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
