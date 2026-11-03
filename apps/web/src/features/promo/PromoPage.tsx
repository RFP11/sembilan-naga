import { useState } from "react";
import { Link } from "../../lib/router";
import { usePromo } from "./api";
import { EraTrack, MapStage, PromoShell, Ribbon } from "./parts";

const TRUTHS = [
  {
    title: "Retakan Agung",
    body: "Seribu tahun lalu, para dewa berperang dan memecah benua menjadi ratusan pulau melayang.",
  },
  {
    title: "Batu-surya",
    body: "Batu di dasar setiap pulau adalah pecahan kekuatan matahari. Energinya menahan pulau tetap melayang di atas kabut.",
  },
  {
    title: "Bawah",
    body: "Orang mati jatuh ke kabut di bawah awan, dan hampir tak ada yang kembali.",
  },
];

const PENNANTS = ["teal", "red", "olive", "gold"] as const;

/** A sign-up link, or a plain label once the DM has closed registration. */
function SignUp({ open }: { open: boolean }) {
  if (!open) return <span className="closed-tag">Pendaftaran ditutup</span>;
  return (
    <Link href="/daftar" className="btn btn-red">
      Daftar sekarang
    </Link>
  );
}

export function PromoPage() {
  const promo = usePromo();
  const [selected, setSelected] = useState("simpang");
  // Stays a link while loading, so a slow request doesn't make it look closed.
  const open = promo.data?.registrationOpen ?? true;

  return (
    <PromoShell title="Serpih Langit: campaign D&D 5e">
      <section className="wrap hero">
        <div className="parchment hero-card">
          <div className="parchment-body">
            <Ribbon>Campaign D&D 5e</Ribbon>
            <h1>Serpih Langit</h1>
            <p className="lead">
              Ratusan pulau melayang dari benua yang hancur dalam perang para dewa. Pulau-pulau itu
              bertahan di udara berkat cahaya matahari. Selama matahari masih bersinar, semuanya
              baik-baik saja.
            </p>
            <div className="hero-actions">
              <SignUp open={open} />
              <a href="#peta" className="btn btn-plain">
                Lihat peta
              </a>
            </div>
          </div>
          <span className="wax-seal" aria-hidden="true">
            SL
          </span>
        </div>
      </section>

      {promo.isPending && <p className="wrap on-wood">Memuat dunia…</p>}
      {promo.error && (
        <p className="wrap on-wood" role="alert">
          Dunia belum bisa dimuat: {promo.error.message}
        </p>
      )}

      {promo.data && (
        <>
          <section className="wrap block" id="peta">
            <Ribbon color="teal">Peta langit</Ribbon>
            <h2>{promo.data.eraInfo.name}</h2>
            <p className="on-wood section-lead">{promo.data.eraInfo.tag}</p>
            <EraTrack promo={promo.data} />
            <p className="on-wood section-lead">
              Klik pulau untuk detailnya. Garis putus-putus adalah rute kapal udara; tanda silang
              merah berarti tidak ada rute.
            </p>
            <MapStage promo={promo.data} selected={selected} onSelect={setSelected} />
            <div className="parchment era-note">
              <div className="parchment-body">
                <ul>
                  {promo.data.eraInfo.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p>{promo.data.eraInfo.summary}</p>
              </div>
            </div>
          </section>

          <section className="wrap block">
            <Ribbon color="gold">Dunia ini</Ribbon>
            <h2>Yang semua orang tahu</h2>
            <div className="grid-3">
              {TRUTHS.map((t) => (
                <article key={t.title} className="parchment">
                  <div className="parchment-body">
                    <h3>{t.title}</h3>
                    <p>{t.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="wrap block" id="pulau-awal">
            <Ribbon>Pulau awal</Ribbon>
            <h2>Dari mana kamu berangkat?</h2>
            <p className="on-wood section-lead">
              Tidak ada satu pulau awal. Setiap pemain memilih sendiri, dan pilihan itu menentukan
              faksi yang menaungimu.
            </p>
            <div className="pennants">
              {promo.data.islands
                .filter((i) => i.start)
                .map((island, n) => (
                  <article key={island.id} className={`pennant pennant-${PENNANTS[n % 4]}`}>
                    <div className="pennant-head">
                      <h3>{island.name}</h3>
                      <p>{island.faction}</p>
                    </div>
                    <div className="pennant-body">
                      <p>
                        <b>{island.vibe}</b>
                      </p>
                      <p>Penduduk: {island.folk.join(", ")}</p>
                      <p className="hook">{island.hook}</p>
                      {open && (
                        <Link href={`/daftar?pulau=${island.id}`} className="btn btn-red btn-small">
                          Mulai di sini
                        </Link>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          </section>

          <section className="wrap block">
            <Ribbon color="olive">Faksi</Ribbon>
            <h2>Siapa melawan siapa</h2>
            <div className="grid-2">
              {promo.data.factions.map((f) => (
                <article key={f.name} className={f.feud ? "plaque plaque-feud" : "plaque"}>
                  <p className="plaque-island">{f.island}</p>
                  <h3>{f.name}</h3>
                  <p>{f.blurb}</p>
                  <p className="plaque-rival">{f.rival}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="wrap block">
            <div className="parchment mist-card">
              <div className="parchment-body">
                <Ribbon color="teal">Sesi Kabut</Ribbon>
                <h2>Mati bukan akhir ceritamu</h2>
                <p>
                  Karakter yang mati jatuh ke kabut tanpa dasar, dan ceritanya berlanjut di sesi
                  khusus bersama arwah lain. Cari jalan kembali ke atas, atau bongkar rahasia di
                  Bawah dan kirim pesan kepada party yang masih hidup.
                </p>
                <div className="hero-actions">
                  <SignUp open={open} />
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </PromoShell>
  );
}
