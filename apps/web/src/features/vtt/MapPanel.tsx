import { MAX_MAP_BYTES, sceneGridSize, type Scene } from "@dnd/contracts";
import { useState, type ChangeEvent } from "react";
import { useDeleteScene, useSetActiveScene, useUploadScene } from "./api";

/** The DM's maps: upload, set the scale, put one on the table. */
export function MapPanel({
  campaignId,
  scenes,
  activeSceneId,
  onCalibrate,
}: {
  campaignId: string;
  scenes: Scene[];
  activeSceneId: string | null;
  onCalibrate: (sceneId: string) => void;
}) {
  const upload = useUploadScene(campaignId);
  const setActive = useSetActiveScene(campaignId);
  const remove = useDeleteScene(campaignId);
  const [tooBig, setTooBig] = useState(false);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // So choosing the same file again still fires this.
    e.target.value = "";
    if (!file) return;
    setTooBig(file.size > MAX_MAP_BYTES);
    if (file.size > MAX_MAP_BYTES) return;
    const form = new FormData();
    form.append("map", file);
    // The scale has to be right before the map is useful, so that comes next.
    upload.mutate(form, { onSuccess: (scene) => onCalibrate(scene.id) });
  };

  const error = upload.error ?? setActive.error ?? remove.error;

  return (
    <div className="map-panel">
      <div className="map-panel-head">
        <h2>Peta</h2>
        <label className={`btn btn-teal btn-small map-upload${upload.isPending ? " busy" : ""}`}>
          {upload.isPending ? "Mengunggah…" : "Unggah peta"}
          <input
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            disabled={upload.isPending}
            onChange={onFile}
          />
        </label>
      </div>
      {tooBig && (
        <p className="map-error" role="alert">
          File terlalu besar (maksimal 25 MB).
        </p>
      )}
      {error && (
        <p className="map-error" role="alert">
          {error.message}
        </p>
      )}
      {scenes.length === 0 ? (
        <p className="muted map-empty">
          Belum ada peta. PNG, JPG, atau WebP, maksimal 25 MB. Pemain baru melihat peta setelah kamu
          menayangkannya.
        </p>
      ) : (
        <ul className="map-list">
          {scenes.map((scene) => {
            const live = scene.id === activeSceneId;
            const { cols, rows } = sceneGridSize(scene);
            return (
              <li key={scene.id} className={live ? "live" : undefined}>
                <span className="map-info">
                  <b>{scene.name}</b>
                  <span className="muted">
                    {cols} × {rows} kotak
                  </span>
                </span>
                {live && <span className="status-tag status-accepted">Tayang</span>}
                <span className="map-actions">
                  <button
                    type="button"
                    className="btn btn-plain btn-small"
                    onClick={() => onCalibrate(scene.id)}
                  >
                    Atur skala
                  </button>
                  <button
                    type="button"
                    className="btn btn-plain btn-small"
                    disabled={setActive.isPending}
                    onClick={() => setActive.mutate(live ? null : scene.id)}
                  >
                    {live ? "Turunkan" : "Tayangkan"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-plain btn-small"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Hapus peta "${scene.name}"?`)) remove.mutate(scene.id);
                    }}
                  >
                    Hapus
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
