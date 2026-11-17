import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowLeftRight,
  CheckCircle2,
  Eye,
  FileImage,
  FilePlus2,
  ImagePlus,
  Plus,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  imageLayout,
  type ImageOptions,
  type ConversionPlan,
} from "../../../../shared/conversion";
import { formatSize, parseRange } from "../../../../shared/plans";
import { useApp } from "../../store";
import { Modal } from "../../components/Modal";
import { PdfPage } from "../../components/PdfPage";
import {
  dimensions,
  drawComposition,
  prepareImage,
  renderPdfImage,
  unwrap,
} from "./engine";
import { useConverter, type ImageItem } from "./store";
import "./converter.css";

function Composition({
  item,
  options,
  width = 240,
}: {
  item: ImageItem;
  options: ImageOptions;
  width?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "150px" },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false;
    const target = canvas.current!;
    setError("");
    if (visible) {
      // Draw into a private canvas so an older asynchronous preview cannot overwrite a newer one.
      const temporary = document.createElement("canvas");
      void drawComposition(temporary, item, options, width)
        .then(() => {
          if (!disposed) {
            target.width = temporary.width;
            target.height = temporary.height;
            target.getContext("2d")!.drawImage(temporary, 0, 0);
          }
          temporary.width = temporary.height = 1;
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    } else target.width = target.height = 1;
    return () => {
      disposed = true;
    };
  }, [item, options, width, visible]);
  const dims = dimensions(item);
  let ratio = 1.414;
  try {
    const l = imageLayout(dims.width, dims.height, options);
    ratio = l.pageHeight / l.pageWidth;
  } catch {
    /* Shown below. */
  }
  return (
    <div
      ref={root}
      className="composition"
      style={{ aspectRatio: String(1 / ratio) }}
    >
      <canvas ref={canvas} aria-label={`Page composition for ${item.name}`} />
      {error && <span className="composition-error">{error}</span>}
    </div>
  );
}

function ConversionPreview({ onClose }: { onClose: () => void }) {
  const state = useConverter(),
    app = useApp();
  const doc = app.documents.find((d) => d.id === state.docId);
  const [index, setIndex] = useState(0),
    [zoom, setZoom] = useState(100);
  const [url, setUrl] = useState(""),
    [info, setInfo] = useState(""),
    [error, setError] = useState("");
  const total =
    state.mode === "image" ? state.images.length : (doc?.pageCount ?? 0);
  useEffect(() => {
    if (state.mode !== "pdf" || !doc) return;
    const controller = new AbortController();
    let objectUrl = "";
    setUrl("");
    setError("");
    setInfo("Rendering preview…");
    void renderPdfImage(
      doc,
      index + 1,
      state.dpi,
      state.format,
      state.quality,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(
          new Blob([new Uint8Array(result.bytes).buffer], {
            type: `image/${state.format}`,
          }),
        );
        setUrl(objectUrl);
        setInfo(
          `${result.width} × ${result.height} px · ${state.dpi} DPI · ${state.format === "jpeg" ? "JPG" : "PNG"}`,
        );
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setInfo("");
        }
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc, index, state.dpi, state.format, state.quality]);
  const item = state.images[index];
  return (
    <Modal title="A look before you convert" onClose={onClose} wide>
      <div className="convert-preview-toolbar">
        <button
          className="icon-button"
          aria-label="Previous preview page"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          <ArrowLeft size={17} />
        </button>
        <span>
          Page {index + 1} of {total}
          {index === 0
            ? " · First page"
            : index === total - 1
              ? " · Last page"
              : ""}
        </span>
        <button
          className="icon-button"
          aria-label="Next preview page"
          disabled={index >= total - 1}
          onClick={() => setIndex(index + 1)}
        >
          <ArrowRight size={17} />
        </button>
        <label>
          Preview zoom{" "}
          <select
            aria-label="Preview zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[50, 100, 150, 200].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="convert-preview-stage">
        <div style={{ width: `${zoom}%`, minWidth: 120, maxWidth: "none" }}>
          {state.mode === "image" && item ? (
            <Composition item={item} options={state.options} width={600} />
          ) : url ? (
            <img src={url} alt={`Output preview of page ${index + 1}`} />
          ) : (
            <p>{error || "Rendering preview…"}</p>
          )}
        </div>
      </div>
      <p className="field-help">
        {state.mode === "image"
          ? `${state.options.pageSize.replace("_", " ")} · ${state.options.orientation} · ${state.options.fitting} · ${state.options.marginMm} mm margins · White background`
          : info}
      </p>
      <div className="modal-actions">
        <button className="button primary" onClick={onClose}>
          Keep editing
        </button>
      </div>
    </Modal>
  );
}

export function Convert({
  onOpenImages,
  onOpenPdf,
  onOpenSaved,
}: {
  onOpenImages: () => void;
  onOpenPdf: () => void;
  onOpenSaved: (id: string) => void;
}) {
  const state = useConverter(),
    app = useApp();
  const { mode, images, options, set } = state;
  const [selected, setSelected] = useState<string[]>([]),
    [preview, setPreview] = useState(false);
  const [progress, setProgress] = useState<{
    status: string;
    done: number;
    total: number;
  } | null>(null);
  const controller = useRef<AbortController | null>(null),
    dragged = useRef<string | null>(null);
  const activeJob = useRef<string | null>(null);
  const abortRequest = useRef<ReturnType<
    typeof window.paperin.conversionAbort
  > | null>(null);
  function cancel() {
    controller.current?.abort();
    if (activeJob.current && !abortRequest.current)
      abortRequest.current = window.paperin.conversionAbort(
        activeJob.current,
        false,
      );
  }
  const doc = app.documents.find((d) => d.id === state.docId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  let pageNumbers: number[] = [],
    validation = "";
  try {
    if (mode === "pdf" && doc) {
      pageNumbers =
        state.selection === "all"
          ? Array.from({ length: doc.pageCount }, (_, i) => i + 1)
          : state.selection === "current"
            ? [state.currentPage]
            : state.selection === "range"
              ? [...new Set(parseRange(state.range, doc.pageCount))].sort(
                  (a, b) => a - b,
                )
              : [...new Set(state.selected)].sort((a, b) => a - b);
      if (!pageNumbers.length) validation = "Select at least one page.";
    }
    if (mode === "image")
      for (const item of images) {
        const dims = dimensions(item);
        imageLayout(dims.width, dims.height, options);
      }
  } catch (e) {
    validation = (e as Error).message;
  }
  function move(id: string, offset: number) {
    const ordered = [...images],
      index = ordered.findIndex((image) => image.id === id),
      next = index + offset;
    if (next < 0 || next >= ordered.length) return;
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    set({ images: ordered, result: null });
  }
  function rotate(id: string, change: number) {
    set({
      images: images.map((item) =>
        item.id === id
          ? {
              ...item,
              rotation: ((item.rotation + change + 360) %
                360) as ImageItem["rotation"],
            }
          : item,
      ),
      result: null,
    });
  }
  async function remove(ids: string[]) {
    const removed = images.filter((item) => ids.includes(item.id));
    set({
      images: images.filter((item) => !ids.includes(item.id)),
      result: null,
    });
    setSelected(selected.filter((id) => !ids.includes(id)));
    for (const item of removed) URL.revokeObjectURL(item.thumbnail);
    const result = await window.paperin.conversionRelease(ids);
    if (!result.ok) app.set({ error: result.error });
  }
  async function run() {
    if (
      app.busy ||
      validation ||
      (mode === "image" ? !images.length : !doc || !pageNumbers.length)
    )
      return;
    const plan: ConversionPlan =
      mode === "image"
        ? { type: "image-to-pdf", imageIds: images.map((i) => i.id), options }
        : {
            type: "pdf-to-image",
            sourceId: doc!.id,
            pages: pageNumbers,
            format: state.format,
            dpi: state.dpi,
            quality: state.quality,
          };
    const signal = new AbortController();
    controller.current = signal;
    abortRequest.current = null;
    let id: string | undefined;
    app.set({ busy: "Preparing conversion…", error: null, saved: [] });
    set({ result: null }, false);
    setProgress({
      status: "Preparing",
      done: 0,
      total: mode === "image" ? images.length : pageNumbers.length,
    });
    try {
      const started = unwrap(await window.paperin.conversionBegin(plan));
      if (!started) return;
      id = started.id;
      activeJob.current = id;
      if (signal.signal.aborted) cancel();
      for (let index = 0; index < started.total; index++) {
        signal.signal.throwIfAborted();
        const text = `Converting ${index + 1} of ${started.total} ${mode === "image" ? "images" : "pages"}`;
        setProgress({ status: text, done: index, total: started.total });
        app.set({ busy: text });
        const bytes =
          mode === "image"
            ? await prepareImage(images[index])
            : (
                await renderPdfImage(
                  doc!,
                  pageNumbers[index],
                  state.dpi,
                  state.format,
                  state.quality,
                  signal.signal,
                )
              ).bytes;
        signal.signal.throwIfAborted();
        unwrap(await window.paperin.conversionAppend(id, bytes));
        setProgress({ status: text, done: index + 1, total: started.total });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      signal.signal.throwIfAborted();
      setProgress({
        status: "Saving",
        done: started.total,
        total: started.total,
      });
      app.set({ busy: "Saving converted files…" });
      const result = unwrap(await window.paperin.conversionFinish(id));
      id = undefined;
      set({ result }, false);
      if (result.status === "completed") app.set({ dirty: false });
      else if (result.error) app.set({ error: result.error });
    } catch (error) {
      let outputs: NonNullable<typeof state.result>["outputs"] = [];
      if (id) {
        const result = await (abortRequest.current ??
          window.paperin.conversionAbort(id, !signal.signal.aborted));
        if (result.ok) outputs = result.value.outputs;
      }
      const message = signal.signal.aborted
        ? "Conversion cancelled."
        : error instanceof Error
          ? error.message
          : "Couldn't save the converted file.";
      set(
        {
          result: {
            status: signal.signal.aborted ? "cancelled" : "failed",
            outputs,
            error: message,
          },
        },
        false,
      );
      if (!signal.signal.aborted) app.set({ error: message });
    } finally {
      await abortRequest.current;
      activeJob.current = null;
      abortRequest.current = null;
      controller.current = null;
      app.set({ busy: null });
      setProgress(null);
    }
  }
  const option = (patch: Partial<ImageOptions>) =>
    set({ options: { ...options, ...patch }, result: null });
  const ready = mode === "image" ? images.length > 0 : !!doc;
  return (
    <div className="converter-page">
      {mode === "home" ? (
        <>
          <div className="convert-heading">
            <span className="eyebrow">YOUR LOCAL WORKSPACE</span>
            <h1>
              Convert files<span>.</span>
            </h1>
            <p>Simple, private file conversion.</p>
          </div>
          <div className="convert-cards">
            <button className="convert-card" onClick={onOpenImages}>
              <span className="convert-card-icon">
                <FilePlus2 size={30} />
              </span>
              <h2>Image to PDF</h2>
              <p>Combine images into a single PDF.</p>
              <span className="button primary">
                Select Images <ArrowRight size={16} />
              </span>
              <small>JPG & PNG → PDF</small>
            </button>
            <button className="convert-card" onClick={onOpenPdf}>
              <span className="convert-card-icon mint">
                <FileImage size={30} />
              </span>
              <h2>PDF to Image</h2>
              <p>Save PDF pages as JPG or PNG.</p>
              <span className="button secondary">
                Select PDF <ArrowRight size={16} />
              </span>
              <small>PDF → JPG & PNG</small>
            </button>
          </div>
          <div className="convert-drop-hint">
            <ImagePlus size={27} />
            <strong>Or drop your files here</strong>
            <span>Images or a PDF. Everything stays on your device.</span>
          </div>
          {(images.length > 0 || doc) && (
            <div className="convert-resume">
              Continue your session{" "}
              {images.length > 0 && (
                <button
                  className="button secondary"
                  onClick={() => set({ mode: "image" }, false)}
                >
                  {images.length} images
                </button>
              )}
              {doc && (
                <button
                  className="button secondary"
                  onClick={() => set({ mode: "pdf" }, false)}
                >
                  {doc.name}
                </button>
              )}
            </div>
          )}
          <p className="convert-privacy">
            <ShieldCheck size={15} />
            100% offline · Your original files stay untouched
          </p>
        </>
      ) : (
        <>
          <header className="convert-workspace-heading">
            <button
              className="icon-button"
              aria-label="Back to conversion tools"
              disabled={!!app.busy}
              onClick={() => set({ mode: "home" }, false)}
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1>{mode === "image" ? "Image to PDF" : "PDF to Image"}</h1>
              <p>
                {mode === "image"
                  ? `${images.length} images · One PDF, in your order`
                  : `${doc?.name ?? "Select a PDF"} · ${doc?.pageCount ?? 0} pages`}
              </p>
            </div>
            <button
              className="button secondary convert-settings-toggle"
              onClick={() => setSettingsOpen(!settingsOpen)}
            >
              Settings
            </button>
          </header>
          <div
            className={`convert-workspace ${settingsOpen ? "settings-visible" : ""}`}
          >
            <section className="convert-files">
              <div className="convert-toolbar">
                <button
                  className="button secondary"
                  disabled={!!app.busy}
                  onClick={mode === "image" ? onOpenImages : onOpenPdf}
                >
                  <Plus size={16} />
                  {mode === "image" ? "Add Images" : "Change PDF"}
                </button>
                {mode === "image" && !!selected.length && (
                  <button
                    className="button danger"
                    disabled={!!app.busy}
                    onClick={() => void remove(selected)}
                  >
                    <Trash2 size={14} />
                    Remove {selected.length}
                  </button>
                )}
                <button
                  className="button secondary"
                  disabled={!ready || !!validation || !!app.busy}
                  onClick={() => setPreview(true)}
                >
                  <Eye size={16} />
                  Preview
                </button>
              </div>
              {mode === "image" ? (
                <>
                  <div className="convert-grid-note">
                    <ArrowLeftRight size={14} />
                    Drag to reorder, or use the arrow buttons.
                  </div>
                  <div className="convert-grid">
                    {images.map((item, index) => (
                      <article
                        key={item.id}
                        className={`convert-image-card ${selected.includes(item.id) ? "selected" : ""}`}
                        draggable={!app.busy}
                        onDragStart={(e) => {
                          dragged.current = item.id;
                          e.dataTransfer.setData("text/folio-image", item.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => {
                          if (dragged.current) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }
                        }}
                        onDragEnd={() => {
                          dragged.current = null;
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!dragged.current || app.busy) return;
                          const ordered = images.filter(
                              (i) => i.id !== dragged.current,
                            ),
                            from = images.find((i) => i.id === dragged.current);
                          if (from) {
                            ordered.splice(index, 0, from);
                            set({ images: ordered });
                          }
                          dragged.current = null;
                        }}
                      >
                        <div className="convert-card-top">
                          <label>
                            <input
                              type="checkbox"
                              aria-label={`Select ${item.name}`}
                              checked={selected.includes(item.id)}
                              disabled={!!app.busy}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? [...selected, item.id]
                                    : selected.filter((id) => id !== item.id),
                                )
                              }
                            />
                            <span>Page {index + 1}</span>
                          </label>
                          <button
                            className="icon-button"
                            aria-label={`Remove ${item.name}`}
                            disabled={!!app.busy}
                            onClick={() => void remove([item.id])}
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <Composition item={item} options={options} />
                        <strong title={item.name}>{item.name}</strong>
                        <small>
                          {dimensions(item).width} × {dimensions(item).height} ·{" "}
                          {formatSize(item.size)}
                        </small>
                        <div className="convert-image-actions">
                          <button
                            className="icon-button"
                            aria-label={`Rotate ${item.name} left`}
                            disabled={!!app.busy}
                            onClick={() => rotate(item.id, -90)}
                          >
                            <RotateCcw size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Rotate ${item.name} right`}
                            disabled={!!app.busy}
                            onClick={() => rotate(item.id, 90)}
                          >
                            <RotateCw size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Move ${item.name} up`}
                            disabled={index === 0 || !!app.busy}
                            onClick={() => move(item.id, -1)}
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label={`Move ${item.name} down`}
                            disabled={index === images.length - 1 || !!app.busy}
                            onClick={() => move(item.id, 1)}
                          >
                            <ArrowDown size={15} />
                          </button>
                        </div>
                      </article>
                    ))}
                    <button
                      className="convert-add-card"
                      disabled={!!app.busy}
                      onClick={onOpenImages}
                    >
                      <ImagePlus size={26} />
                      <span>Add images</span>
                      <small>JPG or PNG</small>
                    </button>
                  </div>
                </>
              ) : doc ? (
                <>
                  <div className="convert-grid-note">
                    {pageNumbers.length} selected · Current page{" "}
                    {state.currentPage}
                  </div>
                  <div className="convert-grid pdf-convert-grid">
                    {Array.from(
                      { length: doc.pageCount },
                      (_, index) => index + 1,
                    ).map((n) => (
                      <div
                        key={n}
                        className={`convert-pdf-card ${pageNumbers.includes(n) ? "selected" : ""} ${state.currentPage === n ? "current" : ""}`}
                      >
                        <button
                          className="convert-page-preview"
                          disabled={!!app.busy}
                          aria-label={`Preview page ${n}`}
                          onClick={() => set({ currentPage: n })}
                        >
                          <PdfPage
                            pdf={doc.pdf}
                            page={n}
                            width={145}
                            maxHeight={205}
                          />
                        </button>
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`Select page ${n}`}
                            disabled={!!app.busy}
                            checked={pageNumbers.includes(n)}
                            onChange={(e) =>
                              set({
                                selection: "selected",
                                currentPage: n,
                                selected: e.target.checked
                                  ? [...new Set([...pageNumbers, n])]
                                  : pageNumbers.filter((p) => p !== n),
                              })
                            }
                          />
                          Page {n}
                        </label>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="convert-drop-hint">
                  <FileImage size={34} />
                  <strong>Select a PDF to get started</strong>
                  <button className="button primary" onClick={onOpenPdf}>
                    Select PDF
                  </button>
                </div>
              )}
              <footer className="convert-footer">
                {mode === "image"
                  ? `${images.length} images · ${images.length} pages`
                  : `${pageNumbers.length} of ${doc?.pageCount ?? 0} pages selected`}
                <span>
                  <ShieldCheck size={13} />
                  Local processing
                </span>
              </footer>
            </section>
            <aside className="convert-settings">
              <h2>Conversion settings</h2>
              <p className="field-help">
                A little control. A ready-to-use result.
              </p>
              <fieldset disabled={!!app.busy}>
                {mode === "image" ? (
                  <>
                    <label className="field-group">
                      Page size
                      <select
                        aria-label="Page size"
                        value={options.pageSize}
                        onChange={(e) =>
                          option({
                            pageSize: e.target
                              .value as ImageOptions["pageSize"],
                          })
                        }
                      >
                        {[
                          ["A4", "A4 · 210 × 297 mm"],
                          ["A5", "A5 · 148 × 210 mm"],
                          ["LETTER", "Letter · 8.5 × 11 in"],
                          ["LEGAL", "Legal · 8.5 × 14 in"],
                          ["MATCH_IMAGE", "Match Image Ratio"],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-group">
                      Orientation
                      <select
                        aria-label="Orientation"
                        value={options.orientation}
                        onChange={(e) =>
                          option({
                            orientation: e.target
                              .value as ImageOptions["orientation"],
                          })
                        }
                      >
                        {["auto", "portrait", "landscape"].map((value) => (
                          <option key={value} value={value}>
                            {value[0].toUpperCase() + value.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field-group">
                      Image fit
                      <select
                        aria-label="Image fit"
                        value={
                          options.fitting === "stretch"
                            ? "stretch"
                            : options.fitting
                        }
                        onChange={(e) =>
                          option({
                            fitting: e.target.value as ImageOptions["fitting"],
                          })
                        }
                      >
                        <option value="contain">
                          Contain · Keep the whole image
                        </option>
                        <option value="cover">
                          Cover · Fill and crop edges
                        </option>
                        {options.fitting === "stretch" && (
                          <option value="stretch">
                            Stretch · Distorts image
                          </option>
                        )}
                      </select>
                    </label>
                    <label className="field-group">
                      Margins
                      <select
                        aria-label="Margins"
                        value={options.marginMm}
                        onChange={(e) =>
                          option({
                            marginMm: Number(
                              e.target.value,
                            ) as ImageOptions["marginMm"],
                          })
                        }
                      >
                        {[
                          [0, "None"],
                          [5, "Small"],
                          [10, "Normal"],
                          [20, "Large"],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label} · {value} mm
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="convert-background">
                      <span />
                      White background
                    </div>
                    <details>
                      <summary>Advanced settings</summary>
                      <label className="convert-checkbox">
                        <input
                          type="checkbox"
                          checked={options.fitting === "stretch"}
                          onChange={(e) =>
                            option({
                              fitting: e.target.checked ? "stretch" : "contain",
                            })
                          }
                        />
                        Stretch image to fill
                      </label>
                      <p className="field-help">
                        Stretch can distort the image's proportions.
                      </p>
                    </details>
                  </>
                ) : (
                  <>
                    <label className="field-group">
                      Output format
                      <select
                        aria-label="Output format"
                        value={state.format}
                        onChange={(e) =>
                          set({ format: e.target.value as "jpeg" | "png" })
                        }
                      >
                        <option value="jpeg">JPG · Smaller files</option>
                        <option value="png">PNG · Lossless detail</option>
                      </select>
                    </label>
                    <label className="field-group">
                      Pages
                      <select
                        aria-label="Pages"
                        value={state.selection}
                        onChange={(e) =>
                          set({
                            selection: e.target.value as typeof state.selection,
                          })
                        }
                      >
                        <option value="all">All Pages</option>
                        <option value="current">Current Page</option>
                        <option value="selected">Selected Pages</option>
                        <option value="range">Custom Range</option>
                      </select>
                    </label>
                    {state.selection === "range" && (
                      <label className="field-group">
                        Page range
                        <input
                          aria-label="Page range"
                          value={state.range}
                          onChange={(e) => set({ range: e.target.value })}
                          placeholder="1-3, 5, 9-12"
                        />
                      </label>
                    )}
                    <label className="field-group">
                      Resolution
                      <select
                        aria-label="Resolution"
                        value={state.dpi}
                        onChange={(e) =>
                          set({
                            dpi: Number(e.target.value) as typeof state.dpi,
                          })
                        }
                      >
                        {[
                          [72, "Small"],
                          [150, "Standard"],
                          [200, "High"],
                          [300, "Print"],
                        ].map(([value, label]) => (
                          <option key={value} value={value}>
                            {label} · {value} DPI
                          </option>
                        ))}
                      </select>
                    </label>
                    {state.format === "jpeg" && (
                      <>
                        <label className="field-group">
                          JPEG quality
                          <select
                            aria-label="JPEG quality"
                            value={
                              [0.6, 0.8, 0.92, 0.98].includes(state.quality)
                                ? state.quality
                                : "custom"
                            }
                            onChange={(e) => {
                              if (e.target.value !== "custom")
                                set({ quality: Number(e.target.value) });
                            }}
                          >
                            {[
                              [0.6, "Low"],
                              [0.8, "Medium"],
                              [0.92, "High"],
                              [0.98, "Maximum"],
                            ].map(([value, label]) => (
                              <option key={value} value={value}>
                                {label} · {Math.round(Number(value) * 100)}%
                              </option>
                            ))}
                            {![0.6, 0.8, 0.92, 0.98].includes(
                              state.quality,
                            ) && (
                              <option value="custom">
                                Custom · {Math.round(state.quality * 100)}%
                              </option>
                            )}
                          </select>
                        </label>
                        <details>
                          <summary>Advanced settings</summary>
                          <label className="field-group">
                            JPEG quality · {Math.round(state.quality * 100)}%
                            <input
                              type="range"
                              min="0.6"
                              max="0.98"
                              step="0.01"
                              value={state.quality}
                              onChange={(e) =>
                                set({ quality: Number(e.target.value) })
                              }
                            />
                          </label>
                        </details>
                      </>
                    )}
                    <p className="field-help">
                      White background. Raster output does not preserve
                      selectable text, links, forms, or digital signatures.
                    </p>
                  </>
                )}
              </fieldset>
              {validation && (
                <p className="convert-validation" role="alert">
                  {validation}
                </p>
              )}
              <div className="convert-export">
                <button
                  className="button primary"
                  disabled={!ready || !!validation || !!app.busy}
                  onClick={() => void run()}
                >
                  {mode === "image" ? (
                    <FilePlus2 size={17} />
                  ) : (
                    <FileImage size={17} />
                  )}
                  {mode === "image" ? "Create PDF" : "Convert"}
                  <ArrowRight size={16} />
                </button>
                <p>Choose where to save next.</p>
              </div>
            </aside>
          </div>
        </>
      )}
      {preview && <ConversionPreview onClose={() => setPreview(false)} />}
      {progress && (
        <Modal title="Converting on your device" onClose={cancel}>
          <p className="modal-description">{progress.status}</p>
          <progress
            className="conversion-progress"
            max={progress.total || 1}
            value={progress.done}
          />
          <p className="field-help">
            {progress.done} of {progress.total} processed
          </p>
          <div className="modal-actions">
            <button className="button secondary" onClick={cancel}>
              Cancel conversion
            </button>
          </div>
        </Modal>
      )}
      {state.result && (
        <div
          className={`notification ${state.result.status === "completed" ? "success-notification" : ""}`}
          role="status"
        >
          <CheckCircle2 size={22} />
          <div>
            <strong>
              {state.result.status === "completed"
                ? "Conversion completed."
                : state.result.error}
            </strong>
            <p>
              {state.result.outputs.length}{" "}
              {state.result.outputs.length === 1 ? "file" : "files"} saved
              {state.result.status !== "completed" &&
              state.result.outputs.length
                ? " · Export is incomplete; saved files remain available."
                : "."}
            </p>
            {!!state.result.outputs.length && (
              <div className="notification-links">
                {state.result.outputs[0].name
                  .toLowerCase()
                  .endsWith(".pdf") && (
                  <button
                    onClick={() => onOpenSaved(state.result!.outputs[0].id)}
                  >
                    Open PDF
                    <ArrowRight size={12} />
                  </button>
                )}
                <button
                  onClick={async () => {
                    const result = await window.paperin.showSaved(
                      state.result!.outputs[0].id,
                    );
                    if (!result.ok) app.set({ error: result.error });
                  }}
                >
                  Show in Folder
                </button>
              </div>
            )}
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss conversion result"
            onClick={() => set({ result: null }, false)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
