import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowDownUp,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FolderOpen,
  GripVertical,
  Redo2,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import {
  originalOrder,
  sameOrder,
  type RearrangeInspection,
} from "../../../../shared/rearrange";
import { useApp, type Document } from "../../store";
import { PdfPage } from "../../components/PdfPage";
import { Modal } from "../../components/Modal";
import { useRearrange } from "./store";
import "./rearrange.css";

const ROW_HEIGHT = 286;
export function Rearrange({
  onOpen,
  onBack,
}: {
  onOpen: () => void;
  onBack: () => void;
}) {
  const state = useRearrange();
  const { documents, busy } = useApp();
  const doc = documents.find((d) => d.id === state.documentId);
  if (!doc)
    return (
      <div className="workspace">
        <header className="workspace-header">
          <div className="heading-icon">
            <ArrowDownUp size={25} />
          </div>
          <div>
            <h1>Rearrange</h1>
            <p>Every page in its right place.</p>
          </div>
        </header>
        <div className="rearrange-empty">
          <ArrowDownUp size={46} strokeWidth={1.2} />
          <h2>A new order. The same document.</h2>
          <p>Move pages, reverse their order, and save a new PDF.</p>
          <button className="button primary" disabled={!!busy} onClick={onOpen}>
            <FolderOpen size={17} />
            Open PDF
          </button>
          <span>
            <ShieldCheck size={14} />
            Your original stays untouched.
          </span>
        </div>
      </div>
    );
  return (
    <LoadedRearrange key={doc.id} doc={doc} onOpen={onOpen} onBack={onBack} />
  );
}

function LoadedRearrange({
  doc,
  onOpen,
  onBack,
}: {
  doc: Document;
  onOpen: () => void;
  onBack: () => void;
}) {
  const state = useRearrange();
  const busy = useApp((s) => s.busy);
  const dirty = useApp((s) => s.dirtyWorkspaces.rearrange);
  const [inspection, setInspection] = useState<RearrangeInspection | null>(
    null,
  );
  const [checking, setChecking] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [focused, setFocused] = useState(state.order[0]);
  const [windowSize, setWindowSize] = useState({
    width: 800,
    height: 600,
    top: 0,
  });
  const [insertion, setInsertion] = useState<number | null>(null);
  const [dragCount, setDragCount] = useState(0);
  const [dragRow, setDragRow] = useState<number | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<number[] | null>(null);
  const dragGhost = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const canceledDrag = useRef(false);
  const cache = useRef(new Map<number, HTMLCanvasElement>());
  const columns = Math.max(1, Math.floor((windowSize.width - 48) / 184));
  const rows = Math.ceil(state.order.length / columns);
  const first = Math.max(0, Math.floor(windowSize.top / ROW_HEIGHT) - 2);
  const last = Math.min(
    rows,
    Math.ceil((windowSize.top + windowSize.height) / ROW_HEIGHT) + 2,
  );
  const original = sameOrder(state.order, originalOrder(doc.pageCount));
  const locked = !!busy || checking || exporting;
  useEffect(() => {
    let active = true;
    useApp
      .getState()
      .set({ busy: "Checking this PDF for rearranging…", error: null });
    void window.paperin
      .inspectRearrange(doc.id)
      .then((result) => {
        if (!active) return;
        if (result.ok) setInspection(result.value);
        else
          setInspection({
            pageCount: doc.pageCount,
            warnings: [],
            blocked: result.error,
          });
      })
      .finally(() => {
        if (active) {
          setChecking(false);
          useApp.getState().set({ busy: null });
        }
      });
    return () => {
      active = false;
      cache.current.clear();
    };
  }, [doc.id]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setWindowSize({
        width: element.clientWidth,
        height: element.clientHeight,
        top: element.scrollTop,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function stopDrag() {
    drag.current = null;
    pointer.current = null;
    setInsertion(null);
    setDragCount(0);
    setDragRow(null);
    dragGhost.current?.remove();
    dragGhost.current = null;
  }
  useEffect(
    () => () => {
      dragGhost.current?.remove();
    },
    [],
  );
  function boundary(x: number, y: number) {
    const element = scroll.current!;
    const rect = element.getBoundingClientRect();
    const row = Math.max(
      0,
      Math.floor((y - rect.top + element.scrollTop - 24) / ROW_HEIGHT),
    );
    const cellWidth = (element.clientWidth - 48) / columns;
    const cell = Math.max(
      0,
      Math.min(columns - 1, Math.floor((x - rect.left - 24) / cellWidth)),
    );
    const after = (x - rect.left - 24) / cellWidth - cell >= 0.5;
    return Math.min(state.order.length, row * columns + cell + (after ? 1 : 0));
  }
  useEffect(() => {
    if (!dragCount) return;
    let frame: number;
    const tick = () => {
      const element = scroll.current,
        point = pointer.current;
      if (element && point) {
        const rect = element.getBoundingClientRect();
        const top = Math.max(0, (rect.top + 64 - point.y) / 64);
        const bottom = Math.max(0, (point.y - rect.bottom + 64) / 64);
        const speed = Math.min(1, bottom) * 15 - Math.min(1, top) * 15;
        if (speed) {
          element.scrollTop += speed;
          setInsertion(boundary(point.x, point.y));
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        canceledDrag.current = true;
        stopDrag();
      }
    };
    window.addEventListener("keydown", escape);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", escape);
    };
  }, [dragCount, columns, state.order.length]);
  function focusPage(id: number) {
    const position = useRearrange.getState().order.indexOf(id);
    if (position < 0 || !scroll.current) return;
    setFocused(id);
    const top = Math.floor(position / columns) * ROW_HEIGHT;
    const element = scroll.current;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight)
      element.scrollTop = top + ROW_HEIGHT - element.clientHeight;
    requestAnimationFrame(() =>
      element
        .querySelector<HTMLButtonElement>(`[data-original="${id}"]`)
        ?.focus(),
    );
  }
  async function save() {
    if (locked || !dirty || inspection?.blocked) return;
    const order = [...state.order];
    setPreview(null);
    setExporting(true);
    setNotice("");
    useApp
      .getState()
      .set({ busy: "Preparing your reordered PDF…", error: null, saved: [] });
    try {
      const result = await window.paperin.exportRearrange({
        documentId: doc.id,
        order,
      });
      if (!result.ok) throw new Error(result.error);
      if (result.value) {
        useRearrange.getState().markSaved(order);
        useApp.getState().set({ saved: [result.value] });
      } else setNotice("Saving cancelled.");
    } catch (error) {
      useApp.getState().set({
        error:
          error instanceof Error
            ? error.message
            : "Couldn't save the reordered PDF.",
      });
    } finally {
      setExporting(false);
      useApp.getState().set({ busy: null });
    }
  }
  function dragOver(event: DragEvent) {
    if (!drag.current || locked) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    pointer.current = { x: event.clientX, y: event.clientY };
    setInsertion(boundary(event.clientX, event.clientY));
  }
  return (
    <div className="rearrange-workspace">
      <header className="rearrange-toolbar">
        <div className="rearrange-document">
          <button
            className="icon-button"
            aria-label="Back to Home"
            disabled={locked}
            onClick={onBack}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 title={doc.name}>{doc.name}</h1>
            <span>{doc.pageCount} pages · Rearrange</span>
          </div>
          <button
            className="icon-button"
            aria-label="Open another PDF"
            disabled={locked}
            onClick={onOpen}
          >
            <FolderOpen size={17} />
          </button>
        </div>
        <div className="rearrange-tools">
          <button
            className="icon-button"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={locked || !state.past.length}
            onClick={state.undo}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            disabled={locked || !state.future.length}
            onClick={state.redo}
          >
            <Redo2 size={18} />
          </button>
          <span className="toolbar-divider" />
          <button
            className="button secondary compact"
            disabled={locked || doc.pageCount < 2}
            onClick={state.reverse}
          >
            <ArrowDownUp size={16} />
            Reverse Pages
          </button>
          <button
            className="button secondary compact"
            disabled={locked || original}
            onClick={state.reset}
          >
            <RotateCcw size={15} />
            Reset Order
          </button>
        </div>
        <div className="rearrange-tools">
          <button
            className="button secondary compact"
            disabled={locked}
            onClick={() =>
              setPreview(
                Math.max(
                  0,
                  state.order.indexOf(state.selected[0] ?? state.order[0]),
                ),
              )
            }
          >
            <Eye size={16} />
            Preview
          </button>
          <button
            className="button primary compact"
            disabled={locked || !dirty || !!inspection?.blocked}
            onClick={() => void save()}
          >
            <Save size={16} />
            Save As
          </button>
        </div>
      </header>
      <div className="rearrange-intro">
        <div>
          <strong>Every page in its right place.</strong>
          <p>
            Drag pages to arrange them. Ctrl+click for multiple pages,
            Shift+click for a range.
          </p>
        </div>
        <span>
          {state.selected.length
            ? `${state.selected.length} page${state.selected.length === 1 ? "" : "s"} selected`
            : "Open. Arrange. Preview. Save."}
        </span>
      </div>
      {(inspection?.blocked || !!inspection?.warnings.length) && (
        <div
          className={`rearrange-warning ${inspection.blocked ? "blocked" : ""}`}
          role={inspection.blocked ? "alert" : "status"}
        >
          {inspection.blocked || inspection.warnings.join(" ")}
        </div>
      )}
      <div
        className="rearrange-scroll"
        ref={scroll}
        role="group"
        aria-label="Rearrange page grid"
        tabIndex={0}
        onFocus={(event) => {
          if (event.target === event.currentTarget && !locked)
            focusPage(
              state.order[Math.min(state.order.length - 1, first * columns)],
            );
        }}
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          setWindowSize((size) => ({ ...size, top }));
        }}
        onDragOver={dragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            pointer.current = null;
            setInsertion(null);
          }
        }}
        onDrop={(event) => {
          if (!drag.current) return;
          event.preventDefault();
          if (!locked && !canceledDrag.current) {
            const ids = drag.current;
            const target = boundary(event.clientX, event.clientY);
            state.move(ids, target);
            setNotice(
              `${ids.length} page${ids.length === 1 ? "" : "s"} moved.`,
            );
          }
          stopDrag();
        }}
        onKeyDown={(event) => {
          if (
            locked ||
            preview !== null ||
            (event.target as HTMLElement).matches("input,textarea,select")
          )
            return;
          const ctrl = event.ctrlKey || event.metaKey,
            key = event.key.toLowerCase();
          if (ctrl && key === "a") {
            event.preventDefault();
            state.all();
            return;
          }
          if (ctrl && (key === "z" || key === "y")) {
            event.preventDefault();
            key === "y" || event.shiftKey ? state.redo() : state.undo();
            requestAnimationFrame(() => focusPage(focused));
            return;
          }
          if (key === "escape") {
            if (drag.current) {
              canceledDrag.current = true;
              stopDrag();
            } else state.clear();
            return;
          }
          if (key === " ") {
            event.preventDefault();
            state.select(focused, true);
            return;
          }
          if (key === "enter") {
            event.preventDefault();
            setPreview(state.order.indexOf(focused));
            return;
          }
          if (key.startsWith("arrow")) {
            event.preventDefault();
            const index = state.order.indexOf(focused);
            const step = key === "arrowleft" || key === "arrowup" ? -1 : 1;
            if (event.altKey) {
              const ids = state.selected.length ? state.selected : [focused];
              const positions = ids.map((id) => state.order.indexOf(id));
              state.move(
                ids,
                step < 0
                  ? Math.max(0, Math.min(...positions) - 1)
                  : Math.min(state.order.length, Math.max(...positions) + 2),
              );
              requestAnimationFrame(() => focusPage(focused));
            } else
              focusPage(
                state.order[
                  Math.max(
                    0,
                    Math.min(
                      state.order.length - 1,
                      index +
                        (key === "arrowup" || key === "arrowdown"
                          ? step * columns
                          : step),
                    ),
                  )
                ],
              );
          }
        }}
      >
        <div
          className="rearrange-grid"
          style={{ height: rows * ROW_HEIGHT + 48 }}
        >
          {[
            ...new Set([
              ...Array.from(
                { length: Math.max(0, last - first) },
                (_, offset) => first + offset,
              ),
              ...(dragRow !== null ? [dragRow] : []),
            ]),
          ]
            .sort((a, b) => a - b)
            .flatMap((row) => {
              return state.order
                .slice(row * columns, (row + 1) * columns)
                .map((id, col) => {
                  const position = row * columns + col;
                  const selected = state.selected.includes(id);
                  const indicator =
                    insertion === position
                      ? "insert-before"
                      : insertion === state.order.length &&
                          position === state.order.length - 1
                        ? "insert-after"
                        : "";
                  return (
                    <button
                      key={id}
                      type="button"
                      style={{
                        top: row * ROW_HEIGHT + 24,
                        left: `calc(30px + (100% - 48px) * ${col} / ${columns})`,
                        width: `calc((100% - 48px) / ${columns} - 12px)`,
                      }}
                      className={`rearrange-page ${selected ? "selected" : ""} ${drag.current?.includes(id) ? "moving" : ""} ${indicator}`}
                      data-original={id}
                      data-position={position + 1}
                      aria-label={`Page ${position + 1}, originally page ${id}`}
                      aria-pressed={selected}
                      tabIndex={focused === id ? 0 : -1}
                      draggable={!locked && doc.pageCount > 1}
                      disabled={locked}
                      onFocus={() => setFocused(id)}
                      onClick={(event) => {
                        if (!drag.current)
                          state.select(
                            id,
                            event.ctrlKey || event.metaKey,
                            event.shiftKey,
                          );
                      }}
                      onDoubleClick={() => setPreview(position)}
                      onDragStart={(event) => {
                        if (locked) {
                          event.preventDefault();
                          return;
                        }
                        canceledDrag.current = false;
                        const ids = selected
                          ? state.order.filter((page) =>
                              state.selected.includes(page),
                            )
                          : [id];
                        if (!selected) state.select(id);
                        drag.current = ids;
                        setDragCount(ids.length);
                        setDragRow(row);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "application/x-paperin-pages",
                          String(ids.length),
                        );
                        const ghost = document.createElement("div");
                        ghost.className = "rearrange-drag-ghost";
                        ghost.textContent = `${ids.length} page${ids.length === 1 ? "" : "s"}`;
                        document.body.appendChild(ghost);
                        dragGhost.current = ghost;
                        event.dataTransfer.setDragImage(ghost, 28, 20);
                      }}
                      onDragEnd={stopDrag}
                    >
                      <div className="rearrange-paper">
                        <PdfPage
                          pdf={doc.pdf}
                          page={id}
                          width={148}
                          maxHeight={202}
                          cache={cache.current}
                        />
                        <span className="page-check">
                          {selected && <Check size={12} strokeWidth={3} />}
                        </span>
                        <GripVertical className="rearrange-grip" size={16} />
                      </div>
                      <strong>Page {position + 1}</strong>
                      <span>Originally page {id}</span>
                    </button>
                  );
                });
            })}
        </div>
      </div>
      <footer className="rearrange-status">
        <span>
          {doc.pageCount} pages · {state.selected.length} selected ·{" "}
          {dirty
            ? "Unsaved changes"
            : original
              ? "Original order"
              : "All changes saved"}
        </span>
        <span>
          {exporting ? (
            <button
              className="text-button"
              onClick={() => void window.paperin.cancelRearrange()}
            >
              Cancel saving
            </button>
          ) : (
            "Alt+Arrow: move selection · Ctrl+Z: undo"
          )}
        </span>
      </footer>
      <span className="sr-only" role="status" aria-live="polite">
        {notice || (dragCount ? `Dragging ${dragCount} pages` : "")}
      </span>
      {preview !== null && (
        <Modal title="Preview page order" wide onClose={() => setPreview(null)}>
          <div className="rearrange-preview">
            <PdfPage
              key={state.order[preview]}
              pdf={doc.pdf}
              page={state.order[preview]}
              width={560}
              maxHeight={Math.max(180, window.innerHeight - 330)}
              text
            />
          </div>
          <div className="rearrange-preview-nav">
            <button
              className="icon-button"
              aria-label="Previous preview page"
              disabled={preview <= 0}
              onClick={() => setPreview(preview - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <span>
              Page {preview + 1} of {doc.pageCount} · Originally page{" "}
              {state.order[preview]}
            </span>
            <button
              className="icon-button"
              aria-label="Next preview page"
              disabled={preview >= doc.pageCount - 1}
              onClick={() => setPreview(preview + 1)}
            >
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setPreview(null)}
            >
              Keep editing
            </button>
            <button
              className="button primary"
              disabled={locked || !dirty || !!inspection?.blocked}
              onClick={() => void save()}
            >
              <Save size={16} />
              Save As
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
