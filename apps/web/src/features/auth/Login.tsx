import { useDevLogin, useProviders } from "../../lib/auth";

const LOGIN_ERRORS: Record<string, string> = {
  state: "Login kedaluwarsa atau terputus. Coba lagi.",
  google: "Login Google gagal. Coba lagi.",
  email: "Akun Google-mu perlu alamat email yang terverifikasi.",
};

export function Login({
  title = "Meja D&D",
  googleLabel = "Masuk dengan Google",
}: {
  title?: string;
  googleLabel?: string;
}) {
  const providers = useProviders();
  const devLogin = useDevLogin();
  const error = new URLSearchParams(window.location.search).get("login_error");
  // Come back to this page after Google.
  const returnTo = encodeURIComponent(window.location.pathname);

  return (
    <div className="centered">
      <h1>{title}</h1>
      {error && <p className="error">{LOGIN_ERRORS[error] ?? "Login gagal."}</p>}
      {providers.isPending && <p className="muted">Memuat…</p>}
      {providers.data?.google && (
        <a className="button" href={`/api/auth/google?returnTo=${returnTo}`}>
          {googleLabel}
        </a>
      )}
      {providers.data && !providers.data.google && !providers.data.devUsers && (
        <p className="muted">
          Belum ada cara login yang dikonfigurasi. Lihat README (login Google / DEV_LOGIN).
        </p>
      )}
      {providers.data?.devUsers && (
        <section className="stack menu">
          <h2 className="muted">Login dev</h2>
          {providers.data.devUsers.map((u) => (
            <button key={u.id} onClick={() => devLogin.mutate(u.id)} disabled={devLogin.isPending}>
              {u.displayName} <span className="muted">{u.email}</span>
            </button>
          ))}
          {providers.data.devUsers.length === 0 && (
            <p className="muted">Belum ada user seed; jalankan `pnpm db:seed`.</p>
          )}
          {devLogin.error && <p className="error">{devLogin.error.message}</p>}
        </section>
      )}
    </div>
  );
}
