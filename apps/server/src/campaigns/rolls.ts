import { campaignGmRoom, campaignRoom, type User } from "@dnd/contracts";
import type { Orm } from "../db";
import { chatMessages } from "../db/schema";
import type { IO } from "../plugins/socket";
import { toRollResult } from "./routes";

/** Saves a server-side roll to the campaign's dice log and shows it to everyone there. */
export async function recordRoll(
  orm: Orm,
  io: IO,
  roll: {
    campaignId: string;
    user: User;
    expression: string;
    label?: string;
    rolls: number[];
    total: number;
    secret?: boolean;
  },
) {
  const [row] = await orm
    .insert(chatMessages)
    .values({
      campaignId: roll.campaignId,
      userId: roll.user.id,
      kind: "roll",
      expression: roll.expression,
      label: roll.label,
      rolls: roll.rolls,
      total: roll.total,
      secret: roll.secret ?? false,
    })
    .returning();
  const result = { ...toRollResult(row!, roll.user.displayName), color: roll.user.diceColor };
  const room = result.secret ? campaignGmRoom(roll.campaignId) : campaignRoom(roll.campaignId);
  io.to(room).emit("dice:rolled", result);
  return result;
}
