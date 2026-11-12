import { lazy, Suspense } from "react";
import { AcceptCoDmPage } from "./features/promo/AcceptCoDmPage";
import { DmPage } from "./features/promo/DmPage";
import { HomePage } from "./features/promo/HomePage";
import { NotesPage } from "./features/promo/NotesPage";
import { PromoPage } from "./features/promo/PromoPage";
import { RegisterPage } from "./features/promo/RegisterPage";
import { usePath } from "./lib/router";

// The tabletop pulls in PixiJS, so visitors of the public page never download it.
const TableApp = lazy(() => import("./TableApp").then((m) => ({ default: m.TableApp })));

export function App() {
  const path = usePath();
  if (path === "/app") {
    return (
      <Suspense fallback={<p className="muted centered">Loading…</p>}>
        <TableApp />
      </Suspense>
    );
  }
  if (path === "/serpih-langit") return <PromoPage />;
  if (path === "/daftar") return <RegisterPage />;
  if (path === "/dm") return <DmPage />;
  if (path === "/dm/catatan") return <NotesPage />;
  if (path === "/undang-dm") return <AcceptCoDmPage />;
  return <HomePage />;
}
