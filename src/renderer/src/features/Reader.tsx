import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Layers2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Scissors,
  Search,
  X,
} from "lucide-react";
import { useApp, type Document } from "../store";
import { PdfPage } from "../components/PdfPage";
import { EmptyState } from "../components/EmptyState";
export function Reader({
  onOpen,
  onOrganize,
}: {
  onOpen: () => void;
  onOrganize: (mode: "merge" | "split", doc: Document) => void;
}) {
  const { documents, activeId } = useApp();
  const doc = documents.find((d) => d.id === activeId);
  const [page, setPage] = useState(1);
  const [thumbs, setThumbs] = useState(true);
  const [zoom, setZoom] = useState("fit-page");
  const [canvasSize, setCanvasSize] = useState({ width: 760, height: 650 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<number[]>([]);
  const [searching, setSearching] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const canvas = useRef<HTMLDivElement>(null);
  const pages = useRef(new Map<number, HTMLDivElement>());
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setPage(1);
    setPageInput("1");
    setQuery("");
    setMatches([]);
    canvas.current?.scrollTo(0, 0);
  }, [activeId]);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver((entries) =>
      setCanvasSize({
        width: entries[0].contentRect.width,
        height: entries[0].contentRect.height,
      }),
    );
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [!!doc, thumbs]);
  useEffect(() => {
    if (!canvas.current || !doc) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (entry) {
          const next = Number((entry.target as HTMLElement).dataset.page);
          setPage(next);
          setPageInput(String(next));
        }
      },
      {
        root: canvas.current,
        rootMargin: "-10% 0px -50% 0px",
        threshold: [0, 0.1, 0.5],
      },
    );
    pages.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [doc, zoom]);
  useEffect(() => {
    let canceled = false;
    if (!doc || !query.trim()) {
      setMatches([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const found: number[] = [];
      for (let n = 1; n <= doc.pageCount; n++) {
        if (canceled) return;
        const content = await (await doc.pdf.getPage(n)).getTextContent();
        if (
          content.items
            .map((item: any) => item.str ?? "")
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())
        )
          found.push(n);
      }
      if (!canceled) {
        setMatches(found);
        setMatchIndex(0);
        setSearching(false);
        if (found[0]) goTo(found[0]);
      }
    }, 300);
    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [doc, query]);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  function goTo(next: number) {
    if (!doc) return;
    const value = Math.min(doc.pageCount, Math.max(1, next));
    setPage(value);
    setPageInput(String(value));
    pages.current
      .get(value)
      ?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function nextMatch(direction: number) {
    if (!matches.length) return;
    const next = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(next);
    goTo(matches[next]);
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "f") {
        event.preventDefault();
        setSearchOpen((v) => !v);
      }
      if ((event.target as HTMLElement).matches("input, select, textarea"))
        return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        goTo(page - 1);
      }
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        goTo(page + 1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page, doc]);
  if (!doc)
    return (
      <div className="workspace">
        <header className="workspace-header">
          <div className="heading-icon">
            <BookIcon />
          </div>
          <div>
            <h1>Reader</h1>
            <p>A quieter place for your documents.</p>
          </div>
        </header>
        <EmptyState type="reader" onOpen={onOpen} />
      </div>
    );
  const width = Math.max(
    200,
    zoom === "fit-width"
      ? canvasSize.width - 84
      : zoom === "fit-page"
        ? Math.min(canvasSize.width - 84, (canvasSize.height - 52) / 1.4142)
        : (595.28 * Number(zoom)) / 100,
  );
  const percentage = Math.round((width / 595.28) * 100);
  return (
    <div className="reader-workspace">
      <div className="reader-tabbar">
        <div className="reader-tab">
          <span className="tiny-file">PDF</span>
          <span>{doc.name}</span>
          <button
            className="icon-button small"
            aria-label="Close document"
            onClick={() => useApp.getState().set({ activeId: null })}
          >
            <X size={14} />
          </button>
        </div>
        <button
          className="icon-button"
          onClick={onOpen}
          aria-label="Open another PDF"
        >
          <Plus size={18} />
        </button>
      </div>
      <div className="reader-toolbar">
        <div className="toolbar-group">
          <button
            className="icon-button"
            onClick={() => setThumbs(!thumbs)}
            title="Toggle thumbnails"
            aria-label="Toggle thumbnails"
          >
            {thumbs ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
          <span className="toolbar-file-name" title={doc.name}>
            {doc.name}
          </span>
        </div>
        <div className="toolbar-group page-navigation">
          <button
            className="icon-button"
            disabled={page <= 1}
            onClick={() => goTo(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={18} />
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              goTo(Number(pageInput) || page);
            }}
          >
            <input
              aria-label="Page number"
              value={pageInput}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={() => goTo(Number(pageInput) || page)}
            />
            <span>/ {doc.pageCount}</span>
          </form>
          <button
            className="icon-button"
            disabled={page >= doc.pageCount}
            onClick={() => goTo(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="toolbar-group">
          <button
            className="icon-button"
            aria-label="Zoom out"
            onClick={() => setZoom(String(Math.max(25, percentage - 25)))}
          >
            <Minus size={16} />
          </button>
          <select
            aria-label="Zoom"
            className="zoom-select"
            value={zoom}
            onChange={(event) => setZoom(event.target.value)}
          >
            <option value="fit-page">Fit page</option>
            <option value="fit-width">Fit width</option>
            {[
              25,
              50,
              75,
              100,
              125,
              150,
              200,
              300,
              ...(![25, 50, 75, 100, 125, 150, 200, 300].includes(
                Number(zoom),
              ) && !zoom.startsWith("fit")
                ? [Number(zoom)]
                : []),
            ]
              .sort((a, b) => a - b)
              .map((n) => (
                <option value={n} key={n}>
                  {n}%
                </option>
              ))}
          </select>
          <button
            className="icon-button"
            aria-label="Zoom in"
            onClick={() => setZoom(String(Math.min(300, percentage + 25)))}
          >
            <Plus size={16} />
          </button>
          <span className="toolbar-divider" />
          <button
            className={`icon-button ${searchOpen ? "active" : ""}`}
            aria-label="Search document"
            title="Search (Ctrl+F)"
            onClick={() => setSearchOpen(!searchOpen)}
          >
            <Search size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Merge this PDF"
            title="Merge this PDF"
            onClick={() => onOrganize("merge", doc)}
          >
            <Layers2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Split this PDF"
            title="Split this PDF"
            onClick={() => onOrganize("split", doc)}
          >
            <Scissors size={18} />
          </button>
        </div>
      </div>
      {searchOpen && (
        <div className="search-bar">
          <Search size={16} />
          <input
            ref={searchRef}
            placeholder="Find in this document…"
            aria-label="Search text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") nextMatch(event.shiftKey ? -1 : 1);
              if (event.key === "Escape") setSearchOpen(false);
            }}
          />
          <span>
            {searching
              ? "Searching…"
              : query
                ? `${matches.length} matching page${matches.length === 1 ? "" : "s"}`
                : "Text PDFs only"}
          </span>
          <button
            className="icon-button small"
            aria-label="Previous match"
            disabled={!matches.length}
            onClick={() => nextMatch(-1)}
          >
            <ArrowLeft size={15} />
          </button>
          <button
            className="icon-button small"
            aria-label="Next match"
            disabled={!matches.length}
            onClick={() => nextMatch(1)}
          >
            <ArrowRight size={15} />
          </button>
          <button
            className="icon-button small"
            aria-label="Close search"
            onClick={() => setSearchOpen(false)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="reader-body">
        {thumbs && (
          <aside className="thumbnail-panel">
            <div className="thumbnail-heading">
              Pages <span>{doc.pageCount}</span>
            </div>
            <div className="thumbnail-list">
              {Array.from({ length: doc.pageCount }, (_, i) => (
                <button
                  key={i}
                  className={`reader-thumb ${page === i + 1 ? "current" : ""}`}
                  onClick={() => goTo(i + 1)}
                  aria-label={`Go to page ${i + 1}`}
                  aria-current={page === i + 1 ? "page" : undefined}
                >
                  <div className="thumb-paper">
                    <PdfPage pdf={doc.pdf} page={i + 1} width={90} />
                  </div>
                  <span>{i + 1}</span>
                </button>
              ))}
            </div>
          </aside>
        )}
        <div className="reader-canvas" ref={canvas}>
          {Array.from({ length: doc.pageCount }, (_, i) => (
            <div
              className="reading-page-wrap"
              ref={(element) => {
                if (element) pages.current.set(i + 1, element);
                else pages.current.delete(i + 1);
              }}
              data-page={i + 1}
              key={`${doc.id}-${i}`}
            >
              <PdfPage
                pdf={doc.pdf}
                page={i + 1}
                width={width}
                text
                search={query}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="reader-status">
        <span>
          Page {page} of {doc.pageCount}
        </span>
        <span>All changes stay on your device</span>
        <span>{percentage}%</span>
      </div>
    </div>
  );
}
function BookIcon() {
  return <Columns2 size={25} strokeWidth={1.7} />;
}
