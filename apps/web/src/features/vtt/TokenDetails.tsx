import type { Token, TokenSize } from "@dnd/contracts";
import { useState } from "react";
import { useDeleteToken, useUpdateToken } from "./api";
import { SIZE_LABEL, SIZES } from "./TokenPanel";

const KIND_LABEL: Record<Token["kind"], string> = {
  monster: "Monster",
  npc: "NPC",
  character: "Karakter",
  object: "Objek",
};

/** The selected token. The DM can change it; players just see what it is. */
export function TokenDetails({
  campaignId,
  token,
  isDm,
  onClose,
}: {
  campaignId: string;
  token: Token;
  isDm: boolean;
  onClose: () => void;
}) {
  const update = useUpdateToken(campaignId, token.sceneId);
  const remove = useDeleteToken(campaignId, token.sceneId);
  const [name, setName] = useState(token.name);
  const [hpValue, setHpValue] = useState("");
  const error = update.error ?? remove.error;

  const changeHp = (by: number) => {
    if (token.hpCurrent === null) return;
    update.mutate({ id: token.id, hpCurrent: Math.max(0, token.hpCurrent + by) });
  };

  return (
    <div className="parchment token-details">
      <div className="parchment-body">
        <p className="token-kind ink-soft">
          {KIND_LABEL[token.kind]} · {SIZE_LABEL[token.size]}
          {token.hidden && " · tersembunyi"}
        </p>
        <h2>{token.name}</h2>
        {isDm && (
          <div className="reg-form">
            {token.hpMax !== null && (
              <div className="token-hp">
                <span>
                  HP{" "}
                  <b>
                    {token.hpCurrent} / {token.hpMax}
                  </b>
                </span>
                <span className="calib-stepper">
                  <button type="button" onClick={() => changeHp(-5)}>
                    −5
                  </button>
                  <button type="button" onClick={() => changeHp(-1)}>
                    −1
                  </button>
                  <button type="button" onClick={() => changeHp(1)}>
                    +1
                  </button>
                  <button type="button" onClick={() => changeHp(5)}>
                    +5
                  </button>
                </span>
                <form
                  className="token-hp-set"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (hpValue === "") return;
                    update.mutate({ id: token.id, hpCurrent: Math.max(0, Number(hpValue)) });
                    setHpValue("");
                  }}
                >
                  <input
                    type="number"
                    min={0}
                    aria-label="HP baru"
                    placeholder="HP"
                    value={hpValue}
                    onChange={(e) => setHpValue(e.target.value)}
                  />
                  <button type="submit" className="roll-btn" disabled={hpValue === ""}>
                    Set HP
                  </button>
                </form>
              </div>
            )}
            <label className="calib-check">
              <input
                type="checkbox"
                checked={token.hidden}
                onChange={(e) => update.mutate({ id: token.id, hidden: e.target.checked })}
              />
              Sembunyikan dari pemain
            </label>
            <details className="token-edit">
              <summary>Ubah token</summary>
              <div className="reg-form">
                <label>
                  Nama
                  <input
                    value={name}
                    maxLength={60}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => {
                      const next = name.trim();
                      if (next && next !== token.name) update.mutate({ id: token.id, name: next });
                      else setName(token.name);
                    }}
                  />
                </label>
                <label>
                  Ukuran
                  <select
                    value={token.size}
                    onChange={(e) =>
                      update.mutate({ id: token.id, size: e.target.value as TokenSize })
                    }
                  >
                    {SIZES.map((s) => (
                      <option key={s} value={s}>
                        {SIZE_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
                {(token.kind === "npc" || token.kind === "object") && (
                  <label>
                    AC
                    <input
                      type="number"
                      min={0}
                      max={50}
                      placeholder="10"
                      value={token.ac ?? ""}
                      onChange={(e) =>
                        update.mutate({
                          id: token.id,
                          ac: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="btn btn-plain btn-small"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Hapus token "${token.name}"?`)) {
                      remove.mutate(token.id, { onSuccess: onClose });
                    }
                  }}
                >
                  Hapus token
                </button>
              </div>
            </details>
          </div>
        )}
        {!isDm && !token.canMove && (
          <p className="ink-soft">Hanya DM yang bisa menggeser token ini.</p>
        )}
        {!isDm && token.canMove && (
          <p className="ink-soft">Token kamu. Geser untuk memindahkannya.</p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error.message}
          </p>
        )}
        <div className="hero-actions">
          <button type="button" className="btn btn-plain btn-small" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
