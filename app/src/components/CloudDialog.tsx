import { useEffect, useState } from "react";
import { Chip } from "./ui/Chip";
import {
  deleteCloudMap,
  listCloudMaps,
  saveCloudMap,
  type CloudMapSummary,
  type CloudUser,
} from "../features/map/cloud";
import type { MapDocument, SavedMapFile } from "../features/map/documents";
import { buildSavedMap } from "../features/map/documents";

interface CloudDialogProps {
  doc: MapDocument;
  terrains: MapDocument["terrains"];
  user: CloudUser | null;
  onOpenMap: (id: string, name: string) => Promise<void>;
  onClose: () => void;
}

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** Save the current map to the signed-in account and reopen earlier saves. */
export function CloudDialog({
  doc,
  terrains,
  user,
  onOpenMap,
  onClose,
}: CloudDialogProps) {
  const [maps, setMaps] = useState<CloudMapSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setMaps(await listCloudMaps());
      setError(null);
    } catch (err) {
      setMaps([]);
      setError(err instanceof Error ? err.message : "Could not load cloud maps.");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setBusyId("save");
    setMessage(null);
    try {
      const payload: SavedMapFile = buildSavedMap(doc, terrains);
      await saveCloudMap({
        id: doc.id,
        name: doc.name.trim() || "Untitled map",
        cols: doc.cols,
        rows: doc.rows,
        data: payload,
      });
      setMessage("Saved to your account.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this map.");
    } finally {
      setBusyId(null);
    }
  };

  const open = async (map: CloudMapSummary) => {
    setBusyId(map.id);
    setError(null);
    try {
      await onOpenMap(map.id, map.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that map.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (map: CloudMapSummary) => {
    if (!window.confirm(`Delete “${map.name}” from your cloud maps?`)) return;
    setBusyId(map.id);
    setError(null);
    try {
      await deleteCloudMap(map.id);
      setMessage(`Deleted “${map.name}”.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that map.");
    } finally {
      setBusyId(null);
    }
  };

  const who =
    user?.name?.trim() || user?.email?.trim() || "your Freebuff account";

  return (
    <div className="print-backdrop" onClick={onClose}>
      <div
        className="print-dialog cloud-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="print-dialog-head">
          <div>
            <h2 id="cloud-dialog-title">Cloud saves</h2>
            <p className="print-lede">Signed in as {who}.</p>
          </div>
          <button
            type="button"
            className="print-close"
            onClick={onClose}
            aria-label="Close cloud saves"
          >
            ✕
          </button>
        </header>

        <div className="print-dialog-body cloud-body">
          <div className="cloud-actions">
            <Chip onClick={() => void save()} disabled={busyId === "save"}>
              {busyId === "save" ? "Saving…" : "Save current map"}
            </Chip>
            <span className="cloud-current">
              “{doc.name.trim() || "Untitled map"}” · {doc.cols} × {doc.rows}
            </span>
          </div>

          {message ? <p className="cloud-note">{message}</p> : null}
          {error ? <p className="cloud-note is-error">{error}</p> : null}

          {maps === null ? (
            <p className="cloud-note">Loading your maps…</p>
          ) : maps.length === 0 ? (
            <p className="cloud-note">
              No cloud maps yet. Save this one to open it on another device.
            </p>
          ) : (
            <ul className="cloud-list">
              {maps.map((map) => (
                <li key={map.id} className="cloud-map-row">
                  <span className="cloud-map-text">
                    <strong>{map.name}</strong>
                    <span className="cloud-map-meta">
                      {map.cols} × {map.rows} · {formatDate(map.updated_at)}
                    </span>
                  </span>
                  <span className="cloud-map-actions">
                    <Chip
                      size="sm"
                      disabled={busyId !== null}
                      onClick={() => void open(map)}
                    >
                      {busyId === map.id ? "Opening…" : "Open"}
                    </Chip>
                    <Chip
                      size="sm"
                      variant="secondary"
                      disabled={busyId !== null}
                      onClick={() => void remove(map)}
                    >
                      Delete
                    </Chip>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="print-dialog-foot">
          <span className="print-tip">
            Cloud saves are separate from this device's autosave.
          </span>
          <form method="post" action="/auth/freebuff/signout">
            <button type="submit" className="chip chip-secondary chip-sm">
              Sign out
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
