import { useEffect, useState } from "react";
import {
  ImagePlus,
  LockKeyhole,
  MousePointer2,
  PenLine,
  Save,
  Trash2,
} from "lucide-react";
import type { Document } from "../../store";
import { useApp } from "../../store";
import {
  fitRect,
  toPdfRect,
  toScreenRect,
  viewportScale,
  type Viewport,
} from "../../../../shared/signature-geometry";
import { useSignature } from "./signature.store";

export async function saveSignatures() {
  const s = useSignature.getState(),
    app = useApp.getState();
  if (app.busy || !s.sessionId) return;
  if (!s.current.placements.length) {
    app.set({ error: "Add a signature before saving." });
    return;
  }
  app.set({ busy: "Preparing your signed PDF…", saved: [], error: null });
  try {
    const result = await window.folio.exportSignature({
      sessionId: s.sessionId,
      placements: s.current.placements,
    });
    if (!result.ok) throw new Error(result.error);
    if (result.value) {
      s.markSaved();
      app.set({ saved: [result.value] });
    }
  } catch (error) {
    app.set({
      error:
        error instanceof Error
          ? error.message
          : "Couldn't save the signed PDF.",
    });
  } finally {
    app.set({ busy: null });
  }
}
export function SignaturePanel({
  doc,
  onCancel,
}: {
  doc: Document;
  onCancel: () => void;
}) {
  const s = useSignature(),
    busy = useApp((a) => a.busy);
  const image = s.images.find((i) => i.id === s.current.imageId);
  const selected = s.current.placements.find((p) => p.id === s.selectedId);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  useEffect(() => {
    let canceled = false;
    setViewport(null);
    if (selected)
      void doc.pdf.getPage(selected.pageIndex + 1).then((page) => {
        if (!canceled) setViewport(page.getViewport({ scale: 1 }));
      });
    return () => {
      canceled = true;
    };
  }, [doc.id, selected?.pageIndex, selected?.id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        useApp.getState().busy ||
        document.querySelector("dialog[open]") ||
        (event.target as HTMLElement).closest("input,select,textarea")
      )
        return;
      const state = useSignature.getState();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? state.redo() : state.undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveSignatures();
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (state.selectedId) {
          event.preventDefault();
          state.remove();
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        state.select(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function pick() {
    const app = useApp.getState();
    if (app.busy || !s.sessionId) return;
    app.set({ busy: "Opening your signature image…", error: null });
    try {
      const result = await window.folio.pickSignature(s.sessionId);
      if (!result.ok) throw new Error(result.error);
      if (result.value) {
        const next = result.value;
        const placements = await Promise.all(
          s.current.placements.map(async (p) => {
            if (p.imageId !== s.current.imageId) return p;
            const v = (await doc.pdf.getPage(p.pageIndex + 1)).getViewport({
              scale: 1,
            });
            const rect = toScreenRect(v, p);
            return {
              ...p,
              imageId: next.id,
              ...toPdfRect(
                v,
                fitRect(
                  {
                    ...rect,
                    height: s.locked
                      ? (rect.width * next.heightPx) / next.widthPx
                      : rect.height,
                  },
                  v.width,
                  v.height,
                ),
              ),
            };
          }),
        );
        s.importImage(next, placements);
      }
    } catch (error) {
      app.set({
        error:
          error instanceof Error
            ? error.message
            : "This image couldn't be opened.",
      });
    } finally {
      app.set({ busy: null });
    }
  }
  function dimension(axis: "width" | "height", value: number) {
    if (!selected || !viewport || !Number.isFinite(value) || value <= 0) return;
    const rect = toScreenRect(viewport, selected);
    const ratio = rect.width / rect.height;
    const next = { ...rect, [axis]: value };
    if (s.locked) {
      if (axis === "width") next.height = value / ratio;
      else next.width = value * ratio;
    }
    s.update(
      selected.id,
      toPdfRect(viewport, fitRect(next, viewport.width, viewport.height)),
    );
  }
  const pageCount = new Set(s.current.placements.map((p) => p.pageIndex)).size;
  const scale = viewport ? viewportScale(viewport) : 1;
  return (
    <aside className="signature-panel" aria-label="Signature panel">
      <header>
        <span className="signature-panel-icon">
          <PenLine size={20} />
        </span>
        <div>
          <h2>Add your signature</h2>
          <p>Choose. Place. Adjust. Save.</p>
        </div>
      </header>
      <div className="signature-panel-content">
        <section>
          <h3>Signature</h3>
          <div className="signature-preview checkerboard">
            {image ? (
              <img src={image.url} alt="Imported signature" />
            ) : (
              <div>
                <ImagePlus size={30} strokeWidth={1.3} />
                <p>Your signature goes here</p>
                <span>Transparent PNG recommended</span>
              </div>
            )}
          </div>
          {image && (
            <p className="signature-image-name" title={image.name}>
              {image.name}
            </p>
          )}
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() => void pick()}
          >
            <ImagePlus size={15} />
            {image ? "Replace Image" : "Choose PNG"}
          </button>
          <button
            className={`button ${s.placing ? "primary" : "secondary"}`}
            disabled={!image || !!busy}
            onClick={() => s.place(!s.placing)}
          >
            <MousePointer2 size={15} />
            {s.placing ? "Click on a page" : "Place Signature"}
          </button>
          <p className="signature-help">
            {s.placing
              ? "Move over a page, then click to place. Press Esc to cancel."
              : "PNG only · up to 15 MB · 16 million pixels"}
          </p>
        </section>
        {selected && (
          <section>
            <h3>
              Selected Signature <span>Page {selected.pageIndex + 1}</span>
            </h3>
            <div className="signature-dimensions">
              <Dimension
                label="Width"
                value={selected.width * scale}
                disabled={!!busy || !viewport}
                onCommit={(v) => dimension("width", v)}
              />
              <Dimension
                label="Height"
                value={selected.height * scale}
                disabled={!!busy || !viewport}
                onCommit={(v) => dimension("height", v)}
              />
            </div>
            <label className="signature-lock">
              <input
                type="checkbox"
                checked={s.locked}
                disabled={!!busy}
                onChange={(e) => s.lock(e.target.checked)}
              />
              Lock Aspect Ratio
            </label>
            <button
              className="button secondary signature-remove"
              disabled={!!busy}
              onClick={s.remove}
            >
              <Trash2 size={14} />
              Remove
            </button>
            <p className="signature-help">
              Drag to move. Drag a corner to resize. Arrow keys move 1 point;
              Shift moves 10.
            </p>
          </section>
        )}
        <section>
          <h3>Document</h3>
          <p className="signature-count" role="status">
            {s.current.placements.length}{" "}
            {s.current.placements.length === 1 ? "signature" : "signatures"} on{" "}
            {pageCount} {pageCount === 1 ? "page" : "pages"}
          </p>
          {!!s.current.placements.length && (
            <div className="signature-placement-list">
              {s.current.placements.map((p, i) => (
                <button
                  key={p.id}
                  className={p.id === s.selectedId ? "active" : ""}
                  disabled={!!busy}
                  onClick={() => {
                    s.select(p.id);
                    document
                      .querySelector(
                        `.reading-page-wrap[data-page="${p.pageIndex + 1}"]`,
                      )
                      ?.scrollIntoView({ block: "start" });
                  }}
                >
                  Signature {i + 1}
                  <span>Page {p.pageIndex + 1}</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <div className="signature-privacy">
          <LockKeyhole size={15} />
          <p>
            Only on this device. Your image is cleared when you close this
            editor.
          </p>
        </div>
        <p className="signature-help">
          This adds a signature image. It does not verify identity or protect
          the PDF from changes.
        </p>
      </div>
      <footer>
        <button
          className="button secondary"
          disabled={!!busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!!busy || !s.current.placements.length}
          onClick={() => void saveSignatures()}
        >
          <Save size={15} />
          Save As
        </button>
      </footer>
    </aside>
  );
}
function Dimension({
  label,
  value,
  disabled,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(Number(value.toFixed(2))));
  useEffect(() => setDraft(String(Number(value.toFixed(2)))), [value]);
  return (
    <label>
      {label}
      <div>
        <input
          aria-label={`Signature ${label.toLowerCase()}`}
          type="number"
          min="0.01"
          step="1"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onCommit(Number(draft));
            setDraft(String(Number(value.toFixed(2))));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span>pt</span>
      </div>
    </label>
  );
}
