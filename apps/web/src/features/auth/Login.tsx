import { useDevLogin, useProviders } from "../../lib/auth";

const LOGIN_ERRORS: Record<string, string> = {
  state: "Login expired or was interrupted. Try again.",
  google: "Google login failed. Try again.",
  email: "Your Google account needs a verified email address.",
};

export function Login() {
  const providers = useProviders();
  const devLogin = useDevLogin();
  const error = new URLSearchParams(window.location.search).get("login_error");

  return (
    <div className="centered">
      <h1>DnD App</h1>
      {error && <p className="error">{LOGIN_ERRORS[error] ?? "Login failed."}</p>}
      {providers.isPending && <p className="muted">Loading…</p>}
      {providers.data?.google && (
        <a className="button" href="/api/auth/google">
          Sign in with Google
        </a>
      )}
      {providers.data && !providers.data.google && !providers.data.devUsers && (
        <p className="muted">
          No login method is configured. See README (Google login / DEV_LOGIN).
        </p>
      )}
      {providers.data?.devUsers && (
        <section className="stack menu">
          <h2 className="muted">Dev login</h2>
          {providers.data.devUsers.map((u) => (
            <button key={u.id} onClick={() => devLogin.mutate(u.id)} disabled={devLogin.isPending}>
              {u.displayName} <span className="muted">{u.email}</span>
            </button>
          ))}
          {providers.data.devUsers.length === 0 && (
            <p className="muted">No seed users; run `pnpm db:seed`.</p>
          )}
          {devLogin.error && <p className="error">{devLogin.error.message}</p>}
        </section>
      )}
    </div>
  );
}
