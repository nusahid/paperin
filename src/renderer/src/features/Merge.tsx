import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  GripVertical,
  Info,
  Layers2,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { ExportPlan } from "../../../shared/types";
import { formatSize } from "../../../shared/plans";
import { useApp } from "../store";
import { PdfPage } from "../components/PdfPage";
import { EmptyState } from "../components/EmptyState";
export function Merge({
  onOpen,
  onPreview,
  onExport,
}: {
  onOpen: () => void;
  onPreview: (plan: ExportPlan) => void;
  onExport: (plan: ExportPlan) => void;
}) {
  const { documents, mergeIds, set, busy, mergeName: name } = useApp();
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const setName = (mergeName: string) => set({ mergeName });
  const docs = mergeIds
    .map((id) => documents.find((d) => d.id === id)!)
    .filter(Boolean);
  const total = docs.reduce((n, d) => n + d.pageCount, 0);
  const plan: ExportPlan = {
    outputs: [
      {
        name: `${name.replace(/\.pdf$/i, "") || "Documents_merged"}.pdf`,
        sources: docs.map((d) => ({
          id: d.id,
          pages: Array.from({ length: d.pageCount }, (_, i) => i + 1),
        })),
      },
    ],
  };
  function remove(ids: string[]) {
    set({ mergeIds: mergeIds.filter((id) => !ids.includes(id)), dirty: true });
    setChecked((c) => c.filter((id) => !ids.includes(id)));
  }
  function move(id: string, index: number) {
    const next = mergeIds.filter((i) => i !== id);
    next.splice(Math.max(0, Math.min(next.length, index)), 0, id);
    set({ mergeIds: next, dirty: true });
  }
  return (
    <div className="workspace merge-workspace">
      <header className="workspace-header">
        <div className="heading-icon">
          <Layers2 size={27} strokeWidth={1.7} />
        </div>
        <div>
          <h1>Merge PDFs</h1>
          <p>Separate files. One complete document.</p>
        </div>
        <span className="workspace-label">ORGANIZE YOUR DOCUMENTS</span>
      </header>
      {!docs.length ? (
        <EmptyState type="merge" onOpen={onOpen} />
      ) : (
        <>
          <div className="merge-content">
            <div className="merge-controls">
              <div>
                <button className="button primary" onClick={onOpen}>
                  <Plus size={17} />
                  Add files
                </button>
                <button
                  className="button secondary"
                  disabled={!checked.length}
                  onClick={() => remove(checked)}
                >
                  <Trash2 size={16} />
                  Remove{checked.length ? ` (${checked.length})` : ""}
                </button>
              </div>
              <span>
                <GripVertical size={15} />
                Drag to reorder
              </span>
            </div>
            <div className="merge-list-head">
              <span>DOCUMENT</span>
              <span>PAGES</span>
            </div>
            <div className="merge-list">
              {docs.map((doc, i) => (
                <div
                  key={doc.id}
                  className={`merge-row ${dragged === doc.id ? "dragging" : ""} ${over === doc.id ? "drag-over" : ""} ${checked.includes(doc.id) ? "row-checked" : ""}`}
                  draggable
                  onDragStart={(event) => {
                    setDragged(doc.id);
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/paperin-id", doc.id);
                  }}
                  onDragEnd={() => {
                    setDragged(null);
                    setOver(null);
                  }}
                  onDragOver={(event) => {
                    if (dragged) {
                      event.preventDefault();
                      setOver(doc.id);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragged && dragged !== doc.id) move(dragged, i);
                    setDragged(null);
                    setOver(null);
                  }}
                >
                  <GripVertical size={18} className="drag-handle" />
                  <input
                    className="row-checkbox"
                    type="checkbox"
                    aria-label={`Select ${doc.name}`}
                    checked={checked.includes(doc.id)}
                    onChange={(event) =>
                      setChecked((ids) =>
                        event.target.checked
                          ? [...ids, doc.id]
                          : ids.filter((id) => id !== doc.id),
                      )
                    }
                  />
                  <div className="merge-file-thumb">
                    <PdfPage pdf={doc.pdf} page={1} width={42} />
                    <span>PDF</span>
                  </div>
                  <div className="merge-file-info">
                    <strong title={doc.name}>{doc.name}</strong>
                    <span>
                      {formatSize(doc.size)}
                      <i />
                      {i === 0
                        ? "Starts on page 1"
                        : `Starts on page ${docs.slice(0, i).reduce((n, d) => n + d.pageCount, 0) + 1}`}
                    </span>
                  </div>
                  <span className="page-count">
                    {doc.pageCount} <span>pages</span>
                  </span>
                  <div className="reorder-buttons">
                    <button
                      className="icon-button small"
                      disabled={i === 0}
                      aria-label={`Move ${doc.name} up`}
                      onClick={() => move(doc.id, i - 1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="icon-button small"
                      disabled={i === docs.length - 1}
                      aria-label={`Move ${doc.name} down`}
                      onClick={() => move(doc.id, i + 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <button
                    className="icon-button remove-file"
                    aria-label={`Remove ${doc.name}`}
                    onClick={() => remove([doc.id])}
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
            <button className="add-more-zone" onClick={onOpen}>
              <Plus size={18} />
              Add another PDF<span>or drop files here</span>
            </button>
            <div className="merge-options">
              <label htmlFor="merge-name">Output file name</label>
              <div className="file-name-input">
                <span className="tiny-file">PDF</span>
                <input
                  id="merge-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    set({ dirty: true });
                  }}
                />
              </div>
              <p>
                <ShieldCheck size={14} />
                Your source files are never changed.
              </p>
            </div>
          </div>
          <footer className="action-bar">
            <div className="total-info">
              <span className="total-icon">
                <Layers2 size={21} />
              </span>
              <div>
                <strong>Ready to bring it together</strong>
                <span>
                  {docs.length} files
                  <i />
                  {total} pages
                  <i />
                  {formatSize(docs.reduce((n, d) => n + d.size, 0))}
                </span>
              </div>
            </div>
            <div className="action-buttons">
              <button
                className="button secondary"
                disabled={docs.length < 2 || !!busy}
                onClick={() => onPreview(plan)}
              >
                <Eye size={17} />
                Preview
              </button>
              <button
                className="button primary"
                disabled={docs.length < 2 || !!busy}
                onClick={() => onExport(plan)}
              >
                <Layers2 size={17} />
                Merge & save
              </button>
            </div>
          </footer>
          {docs.length === 1 && (
            <div className="merge-hint">
              <Info size={14} />
              Add at least one more PDF to merge.
            </div>
          )}
        </>
      )}
    </div>
  );
}
