import { z } from "zod";

// The 3D dice. Each player picks a colour; it travels with their rolls, so everyone at the
// table sees whose dice are tumbling.

export const DICE_COLORS = ["gold", "red", "silver", "tiedye"] as const;
export const diceColor = z.enum(DICE_COLORS);
export type DiceColor = z.infer<typeof diceColor>;

export const updatePreferencesRequest = z.object({ diceColor });
export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesRequest>;
