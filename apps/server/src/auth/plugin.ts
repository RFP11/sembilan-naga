import {
  authProvidersResponse,
  devLoginRequest,
  type AuthProvidersResponse,
  type MeResponse,
  type User,
} from "@dnd/contracts";
import fastifyCookie from "@fastify/cookie";
import { decodeIdToken, generateCodeVerifier, generateState, Google } from "arctic";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Config } from "../config";
import type { Db } from "../db";
import { users } from "../db/schema";
import { createSession, deleteSession, SESSION_COOKIE, validateSession } from "./session";

declare module "fastify" {
  interface FastifyRequest {
    /** The logged-in user, or null. Set for every request by the auth hook. */
    user: User | null;
  }
}

export type AuthConfig = Pick<
  Config,
  "NODE_ENV" | "PUBLIC_URL" | "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "DEV_LOGIN"
>;

const OAUTH_COOKIES = { state: "oauth_state", verifier: "oauth_verifier" } as const;

/** 401s unless someone is logged in. Use as a route preHandler. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.user) return reply.code(401).send({ error: "login required" });
}

export async function registerAuth(app: FastifyInstance, config: AuthConfig, db: Db) {
  const secure = config.PUBLIC_URL.startsWith("https://");
  const devLogin = config.DEV_LOGIN && config.NODE_ENV !== "production";
  const google =
    config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
      ? new Google(
          config.GOOGLE_CLIENT_ID,
          config.GOOGLE_CLIENT_SECRET,
          new URL("/api/auth/google/callback", config.PUBLIC_URL).toString(),
        )
      : undefined;

  await app.register(fastifyCookie);

  const setSessionCookie = (reply: FastifyReply, token: string, expires: Date) =>
    reply.setCookie(SESSION_COOKIE, token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure,
      expires,
    });

  const startSession = async (reply: FastifyReply, userId: string) => {
    const { token, expiresAt } = await createSession(db.orm, userId);
    setSessionCookie(reply, token, expiresAt);
  };

  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;
    const session = await validateSession(db.orm, token);
    req.user = session?.user ?? null;
    if (session?.renewedUntil) setSessionCookie(reply, token, session.renewedUntil);
  });

  await app.register(
    async (auth) => {
      auth.get("/me", async (req): Promise<MeResponse> => ({ user: req.user }));

      auth.get("/providers", async (): Promise<AuthProvidersResponse> => {
        const devUsers = devLogin
          ? await db.orm
              .select({ id: users.id, displayName: users.displayName, email: users.email })
              .from(users)
              .where(isNull(users.googleSub))
              .orderBy(users.email)
              .limit(20)
          : undefined;
        return authProvidersResponse.parse({ google: Boolean(google), devUsers });
      });

      auth.post("/logout", async (req, reply) => {
        const token = req.cookies[SESSION_COOKIE];
        if (token) await deleteSession(db.orm, token);
        reply.clearCookie(SESSION_COOKIE, { path: "/" });
        return { ok: true };
      });

      if (devLogin) {
        // Dev only: log in as a seed user (no password, no Google). Seed users have no
        // google_sub, which keeps real accounts out of reach.
        auth.post("/dev-login", async (req, reply) => {
          const parsed = devLoginRequest.safeParse(req.body);
          if (!parsed.success) return reply.code(400).send({ error: "invalid payload" });
          const [user] = await db.orm
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.id, parsed.data.userId), isNull(users.googleSub)));
          if (!user) return reply.code(404).send({ error: "no such dev user" });
          await startSession(reply, user.id);
          return { ok: true };
        });
      }

      if (google) {
        const cookieOpts = {
          path: "/api/auth",
          httpOnly: true,
          sameSite: "lax",
          secure,
          maxAge: 600,
        } as const;

        auth.get("/google", async (_req, reply) => {
          const state = generateState();
          const verifier = generateCodeVerifier();
          const url = google.createAuthorizationURL(state, verifier, [
            "openid",
            "profile",
            "email",
          ]);
          reply.setCookie(OAUTH_COOKIES.state, state, cookieOpts);
          reply.setCookie(OAUTH_COOKIES.verifier, verifier, cookieOpts);
          return reply.redirect(url.toString());
        });

        auth.get<{ Querystring: { code?: string; state?: string } }>(
          "/google/callback",
          async (req, reply) => {
            const home = (error?: string) =>
              reply.redirect(
                new URL(error ? `/?login_error=${error}` : "/", config.PUBLIC_URL).toString(),
              );
            const { code, state } = req.query;
            const verifier = req.cookies[OAUTH_COOKIES.verifier];
            reply.clearCookie(OAUTH_COOKIES.state, { path: "/api/auth" });
            reply.clearCookie(OAUTH_COOKIES.verifier, { path: "/api/auth" });
            if (!code || !state || !verifier || state !== req.cookies[OAUTH_COOKIES.state])
              return home("state");

            let claims: {
              sub: string;
              email?: string;
              email_verified?: boolean;
              name?: string;
              picture?: string;
            };
            try {
              const tokens = await google.validateAuthorizationCode(code, verifier);
              claims = decodeIdToken(tokens.idToken()) as typeof claims;
            } catch (err) {
              req.log.warn({ err }, "google login failed");
              return home("google");
            }
            if (!claims.email || !claims.email_verified) return home("email");

            const profile = {
              email: claims.email.toLowerCase(),
              displayName: claims.name ?? claims.email,
              avatarUrl: claims.picture ?? null,
            };
            const [user] = await db.orm
              .insert(users)
              .values({ googleSub: claims.sub, ...profile })
              .onConflictDoUpdate({ target: users.googleSub, set: profile })
              .returning({ id: users.id });
            await startSession(reply, user!.id);
            return home();
          },
        );
      }
    },
    { prefix: "/api/auth" },
  );
}
