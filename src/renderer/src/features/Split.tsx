import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Eye,
  FileOutput,
  Info,
  Save,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import {
  formatSize,
  parseRange,
  safeName,
  splitPlan,
  type SplitMode,
} from "../../../shared/plans";
import type { ExportPlan } from "../../../shared/types";
import { useApp } from "../store";
import { PdfPage } from "../components/PdfPage";
import { EmptyState } from "../components/EmptyState";
const modeDetails: Record<
  SplitMode,
  { label: string; description: string; action: string }
> = {
  extract: {
    label: "Extract selected pages",
    description: "Create one new PDF with just the pages you select.",
    action: "Extract & save",
  },
  ranges: {
    label: "Split by ranges",
    description: "Create one PDF per range. Separate groups with a semicolon.",
    action: "Split & save",
  },
  every: {
    label: "Split every N pages",
    description:
      "Divide your document into evenly sized parts. The last part may be shorter.",
    action: "Split & save",
  },
  remove: {
    label: "Remove selected pages",
    description:
      "Create a new PDF without the selected pages. The original stays intact.",
    action: "Remove & save",
  },
};
export function Split({
  onOpen,
  onPreview,
  onExport,
}: {
  onOpen: () => void;
  onPreview: (plan: ExportPlan) => void;
  onExport: (plan: ExportPlan) => void;
}) {
  const { documents, splitId, selected, set, busy, splitConfig } = useApp();
  const doc = documents.find((d) => d.id === splitId);
  const { mode, ranges, every, name, rangeInput } = splitConfig;
  const config = (patch: Partial<typeof splitConfig>) =>
    set({ splitConfig: { ...useApp.getState().splitConfig, ...patch } });
  const setMode = (mode: SplitMode) => config({ mode });
  const setRanges = (ranges: string) => config({ ranges });
  const setEvery = (every: number) => config({ every });
  const setName = (name: string) => config({ name });
  const setRangeInput = (rangeInput: string) => config({ rangeInput });
  const [rangeError, setRangeError] = useState("");
  useEffect(() => {
    if (doc && splitConfig.id !== doc.id) {
      config({
        id: doc.id,
        name: `${safeName(doc.name)}_extracted.pdf`,
        ranges: "",
        mode: "extract",
        rangeInput: "",
      });
      setRangeError("");
    }
  }, [splitId]);
  const { plan, error } = useMemo(() => {
    if (!doc) return { plan: null, error: "" };
    try {
      return {
        plan: splitPlan(
          doc.id,
          doc.pageCount,
          selected,
          mode,
          ranges,
          every,
          name,
        ),
        error: "",
      };
    } catch (error: any) {
      return { plan: null, error: error.message as string };
    }
  }, [doc, selected, mode, ranges, every, name]);
  function select(pages: number[]) {
    set({ selected: pages, dirty: true });
    setRangeError("");
  }
  const all = doc ? Array.from({ length: doc.pageCount }, (_, i) => i + 1) : [];
  const visualSelection =
    mode === "ranges" || mode === "every"
      ? [
          ...new Set(
            plan?.outputs.flatMap((output) =>
              output.sources.flatMap((source) => source.pages),
            ) ?? [],
          ),
        ]
      : selected;
  function changeMode(value: SplitMode) {
    setMode(value);
    if (doc)
      setName(
        `${safeName(doc.name)}_${value === "extract" ? "extracted" : value === "remove" ? "remaining" : "split"}.pdf`,
      );
    set({ dirty: true });
  }
  return (
    <div className="workspace split-workspace">
      <header className="workspace-header">
        <div className="heading-icon">
          <Scissors size={28} strokeWidth={1.7} />
        </div>
        <div>
          <h1>Split PDF</h1>
          <p>A whole document. Only the pages you need.</p>
        </div>
        <span className="workspace-label">MAKE IT YOUR OWN</span>
      </header>
      {!doc ? (
        <EmptyState type="split" onOpen={onOpen} />
      ) : (
        <>
          <div className="split-file-bar">
            <span className="pdf-file-icon">PDF</span>
            <div>
              <strong>{doc.name}</strong>
              <span>
                {doc.pageCount} pages
                <i />
                {formatSize(doc.size)}
              </span>
            </div>
            <button className="button secondary compact" onClick={onOpen}>
              <ArrowLeftRight size={14} />
              Replace file
            </button>
          </div>
          <div className="split-body">
            <div className="split-pages">
              <div className="selection-toolbar">
                <span>
                  {mode === "ranges" || mode === "every"
                    ? "Output pages"
                    : "Select:"}
                </span>
                <div hidden={mode === "ranges" || mode === "every"}>
                  {["All", "None", "Odd", "Even"].map((option) => (
                    <button
                      key={option}
                      className="selection-chip"
                      onClick={() =>
                        select(
                          option === "All"
                            ? all
                            : option === "None"
                              ? []
                              : all.filter(
                                  (p) => p % 2 === (option === "Odd" ? 1 : 0),
                                ),
                        )
                      }
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <span className="selection-count">
                  {visualSelection.length} selected
                </span>
              </div>
              <div className="page-grid">
                {all.map((page) => (
                  <button
                    disabled={mode === "ranges" || mode === "every"}
                    className={`split-page ${visualSelection.includes(page) ? "selected" : ""}`}
                    key={page}
                    onClick={() =>
                      select(
                        visualSelection.includes(page)
                          ? selected.filter((p) => p !== page)
                          : [...selected, page].sort((a, b) => a - b),
                      )
                    }
                    aria-label={`Select page ${page}`}
                    aria-pressed={visualSelection.includes(page)}
                  >
                    <div className="split-page-paper">
                      <PdfPage pdf={doc.pdf} page={page} width={100} />
                      <span className="page-check">
                        {visualSelection.includes(page) && (
                          <Check size={12} strokeWidth={3} />
                        )}
                      </span>
                    </div>
                    <span className="split-page-number">{page}</span>
                  </button>
                ))}
              </div>
              <div className="grid-hint">
                {mode === "ranges" || mode === "every"
                  ? "Your ranges determine the output. Blue pages are "
                  : "Click a page to select it. Blue pages are "}
                {mode === "remove" ? "removed from" : "included in"} your
                output.
              </div>
            </div>
            <aside className="split-settings">
              <div className="split-settings-top">
                <span className="panel-eyebrow">YOUR OUTPUT</span>
                <label htmlFor="split-mode">Split mode</label>
                <select
                  id="split-mode"
                  value={mode}
                  onChange={(event) =>
                    changeMode(event.target.value as SplitMode)
                  }
                >
                  {Object.entries(modeDetails).map(([value, detail]) => (
                    <option value={value} key={value}>
                      {detail.label}
                    </option>
                  ))}
                </select>
                <div className="info-box">
                  <Info size={17} />
                  <p>{modeDetails[mode].description}</p>
                </div>
                {(mode === "extract" || mode === "remove") && (
                  <div className="field-group">
                    <label htmlFor="select-range">Or select by range</label>
                    <input
                      id="select-range"
                      placeholder="e.g. 1-3, 7, 10-12"
                      value={rangeInput}
                      onChange={(event) => setRangeInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          try {
                            select(parseRange(rangeInput, doc.pageCount));
                          } catch (error: any) {
                            setRangeError(error.message);
                          }
                        }
                      }}
                    />
                    <button
                      className="text-button"
                      onClick={() => {
                        try {
                          select(parseRange(rangeInput, doc.pageCount));
                        } catch (error: any) {
                          setRangeError(error.message);
                        }
                      }}
                    >
                      Apply range
                      <ChevronRight size={13} />
                    </button>
                    {rangeError && <p className="field-error">{rangeError}</p>}
                  </div>
                )}
                {mode === "ranges" && (
                  <div className="field-group">
                    <label htmlFor="split-ranges">Page ranges</label>
                    <input
                      id="split-ranges"
                      placeholder="1-3; 4-6; 7-10"
                      value={ranges}
                      onChange={(event) => {
                        setRanges(event.target.value);
                        set({ dirty: true });
                      }}
                    />
                    <span className="field-help">
                      One output for each group.
                    </span>
                  </div>
                )}
                {mode === "every" && (
                  <div className="field-group">
                    <label htmlFor="every-pages">Pages in each PDF</label>
                    <input
                      id="every-pages"
                      type="number"
                      min="1"
                      max={doc.pageCount}
                      value={every}
                      onChange={(event) => {
                        setEvery(Number(event.target.value));
                        set({ dirty: true });
                      }}
                    />
                  </div>
                )}
                <div className="field-group">
                  <label htmlFor="output-name">
                    {mode === "every" || mode === "ranges"
                      ? "Output name prefix"
                      : "Output file name"}
                  </label>
                  <input
                    id="output-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      set({ dirty: true });
                    }}
                  />
                </div>
                {plan && (
                  <div className="output-summary">
                    <FileOutput size={17} />
                    <div>
                      <strong>
                        {plan.outputs.length} PDF
                        {plan.outputs.length > 1 ? "s" : ""}
                      </strong>
                      <span>
                        {plan.outputs.reduce(
                          (n, o) =>
                            n +
                            o.sources.reduce((m, s) => m + s.pages.length, 0),
                          0,
                        )}{" "}
                        pages in total
                      </span>
                    </div>
                  </div>
                )}
                {!plan && <p className="validation-hint">{error}</p>}
              </div>
              <div className="split-actions">
                <button
                  className="button secondary"
                  disabled={!plan || !!busy}
                  onClick={() => plan && onPreview(plan)}
                >
                  <Eye size={16} />
                  Preview output
                </button>
                <button
                  className="button primary"
                  disabled={!plan || !!busy}
                  onClick={() => plan && onExport(plan)}
                >
                  <Save size={17} />
                  {modeDetails[mode].action}
                </button>
                <span>
                  <ShieldCheck size={13} />
                  Original file stays untouched
                </span>
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
