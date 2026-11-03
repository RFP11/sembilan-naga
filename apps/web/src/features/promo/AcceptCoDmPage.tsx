import { useEffect, useState } from "react";
import { useLogout, useMe } from "../../lib/auth";
import { Link } from "../../lib/router";
import { Login } from "../auth/Login";
import { useAcceptCoDm } from "./api";
import { PromoShell, Ribbon } from "./parts";

// The token arrives in the URL fragment. It's kept for this tab so it survives the trip to
// Google and back, which would otherwise lose it.
const STORAGE_KEY = "dnd:co-dm-invite";

function readStored() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function store(token: string | null) {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode); opening the link again after login still works
  }
}

export function AcceptCoDmPage() {
  const me = useMe();
  const logout = useLogout();
  const accept = useAcceptCoDm();
  const [token] = useState(() => window.location.hash.slice(1) || readStored());
  const user = me.data?.user;

  useEffect(() => {
    if (!token) return;
    store(token);
    // Keeps the token out of the address bar and browser history.
    window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  let content;
  if (accept.isSuccess) {
    content = (
      <div className="reg-status">
        <p className="status-tag status-accepted" role="status">
          Kamu sekarang co-DM
        </p>
        <p>Selamat datang di balik layar Serpih Langit.</p>
        <div className="hero-actions">
          <Link href="/dm" className="btn btn-red">
            Buka Halaman DM
          </Link>
        </div>
      </div>
    );
  } else if (!token) {
    content = <p role="alert">Link undangan tidak lengkap. Buka lagi link dari DM.</p>;
  } else if (me.isPending) {
    content = <p>Memuat…</p>;
  } else if (me.error) {
    content = <p role="alert">Halaman belum bisa dimuat. Coba muat ulang.</p>;
  } else if (!user) {
    content = (
      <div className="login-box">
        <p>Masuk dengan akun Google yang diundang untuk menerima undangan ini.</p>
        <Login title="Masuk untuk menerima" googleLabel="Masuk dengan Google" />
      </div>
    );
  } else {
    content = (
      <div className="reg-status">
        <p>
          Co-DM bisa mengatur era peta, membuka dan menutup pendaftaran, serta melihat data dan
          character sheet semua pendaftar. Kamu juga mendapat hak GM di meja.
        </p>
        <p>
          Kamu masuk sebagai <b>{user.email}</b>.
        </p>
        {accept.error && (
          <p className="form-error" role="alert">
            {accept.error.message}
          </p>
        )}
        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-red"
            disabled={accept.isPending}
            onClick={() =>
              accept.mutate(token, {
                onSuccess: () => store(null),
              })
            }
          >
            {accept.isPending ? "Menerima…" : "Terima undangan"}
          </button>
          <button
            type="button"
            className="btn btn-plain"
            onClick={() => {
              accept.reset();
              logout.mutate();
            }}
          >
            Ganti akun
          </button>
        </div>
      </div>
    );
  }

  return (
    <PromoShell title="Undangan co-DM: Serpih Langit">
      <section className="wrap block narrow">
        <div className="parchment">
          <div className="parchment-body">
            <Ribbon color="gold">Undangan</Ribbon>
            <h1>Jadi co-DM Serpih Langit</h1>
            {content}
          </div>
        </div>
      </section>
    </PromoShell>
  );
}
