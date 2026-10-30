// Cookie sessions. The cookie holds a random token; the database stores only its SHA-256,
// so a leaked sessions table can't be replayed.

import type { User } from "@dnd/contracts";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import type { Orm } from "../db";
import { sessions, users } from "../db/schema";

export const SESSION_COOKIE = "session";
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL = 30 * DAY;
/** Sessions used within this window of expiring are extended (sliding expiry). */
const RENEW_WITHIN = 15 * DAY;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(
  orm: Orm,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL);
  await orm.insert(sessions).values({ id: hash(token), userId, expiresAt });
  return { token, expiresAt };
}

/**
 * The session's user, or null when the token is unknown or expired. `renewedUntil` is set
 * when the expiry was extended, so the caller can refresh the cookie too.
 */
export async function validateSession(
  orm: Orm,
  token: string,
): Promise<{ user: User; renewedUntil?: Date } | null> {
  const id = hash(token);
  const [row] = await orm
    .select({
      expiresAt: sessions.expiresAt,
      user: {
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id));
  if (!row) return null;

  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await orm.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (row.expiresAt.getTime() - now < RENEW_WITHIN) {
    const renewedUntil = new Date(now + SESSION_TTL);
    await orm.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id));
    return { user: row.user, renewedUntil };
  }
  return { user: row.user };
}

export async function deleteSession(orm: Orm, token: string): Promise<void> {
  await orm.delete(sessions).where(eq(sessions.id, hash(token)));
}
