import { useEffect, useRef, useState } from "react";
import { TextLayer } from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { PageViewport } from "pdfjs-dist/types/src/display/page_viewport";
import { AlertCircle } from "lucide-react";
export function PdfPage({
  pdf,
  page,
  width,
  text = false,
  search = "",
  maxHeight,
  scale,
  overlay,
  cache,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  width: number;
  text?: boolean;
  search?: string;
  maxHeight?: number;
  scale?: number;
  overlay?: (viewport: PageViewport) => React.ReactNode;
  cache?: Map<number, HTMLCanvasElement>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ratio, setRatio] = useState(1.4142);
  const [error, setError] = useState(false);
  const [textVersion, setTextVersion] = useState(0);
  const [sourcePage, setSourcePage] = useState<PDFPageProxy | null>(null);
  const natural = sourcePage?.getViewport({ scale: 1 });
  const displayScale =
    scale ??
    Math.min(
      width / (natural?.width ?? width),
      maxHeight && natural ? maxHeight / natural.height : Infinity,
    );
  const displayViewport = sourcePage?.getViewport({ scale: displayScale });
  const placeholderWidth =
    scale !== undefined
      ? 595.28 * scale
      : maxHeight
        ? Math.min(width, maxHeight / ratio)
        : width;
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(entries.some((e) => e.isIntersecting));
      },
      { rootMargin: "350px" },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) {
      // Release offscreen bitmap memory while keeping the page-sized placeholder.
      if (canvas.current) {
        canvas.current.width = 1;
        canvas.current.height = 1;
      }
      layer.current?.replaceChildren();
      return;
    }
    let disposed = false;
    let renderTask: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    const draw = async () => {
      try {
        const source = await pdf.getPage(page);
        if (disposed) return;
        const natural = source.getViewport({ scale: 1 });
        const viewport = source.getViewport({
          scale:
            scale ??
            Math.min(
              width / natural.width,
              maxHeight ? maxHeight / natural.height : Infinity,
            ),
        });
        setSourcePage(source);
        setRatio(natural.height / natural.width);
        const target = canvas.current!;
        const dpr = Math.min(window.devicePixelRatio || 1, text ? 2 : 1.5);
        target.width = Math.ceil(viewport.width * dpr);
        target.height = Math.ceil(viewport.height * dpr);
        const cached = cache?.get(page);
        if (
          cached &&
          cached.width === target.width &&
          cached.height === target.height
        ) {
          target.getContext("2d")!.drawImage(cached, 0, 0);
        } else {
          renderTask = source.render({
            canvas: target,
            viewport,
            transform: [dpr, 0, 0, dpr, 0, 0],
          });
          await renderTask.promise;
          if (cache && !disposed) {
            const bitmap = document.createElement("canvas");
            bitmap.width = target.width;
            bitmap.height = target.height;
            bitmap.getContext("2d")!.drawImage(target, 0, 0);
            cache.set(page, bitmap);
            if (cache.size > 96) cache.delete(cache.keys().next().value!);
          }
        }
        if (text && layer.current && !disposed) {
          layer.current.replaceChildren();
          layer.current.style.setProperty(
            "--total-scale-factor",
            String(viewport.scale),
          );
          layer.current.style.setProperty("--scale-round-x", "1px");
          layer.current.style.setProperty("--scale-round-y", "1px");
          textLayer = new TextLayer({
            textContentSource: source.streamTextContent(),
            container: layer.current,
            viewport,
          });
          await textLayer.render();
          if (!disposed) setTextVersion((version) => version + 1);
        }
      } catch (error: any) {
        if (!disposed && error.name !== "RenderingCancelledException")
          setError(true);
      }
    };
    void draw();
    return () => {
      disposed = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, page, width, visible, text, maxHeight, scale, cache]);
  useEffect(() => {
    if (!layer.current) return;
    // Highlight text spans without replacing PDF.js' selectable text content.
    layer.current
      .querySelectorAll("span")
      .forEach((span) =>
        span.classList.toggle(
          "search-hit",
          !!search &&
            (span.textContent ?? "")
              .toLowerCase()
              .includes(search.toLowerCase()),
        ),
      );
  }, [search, textVersion]);
  return (
    <div
      ref={root}
      className={`pdf-page ${text ? "reading-page" : ""}`}
      style={{
        width: displayViewport?.width ?? placeholderWidth,
        height: displayViewport?.height ?? placeholderWidth * ratio,
      }}
    >
      <canvas ref={canvas} style={{ width: "100%", height: "100%" }} />
      {text && (
        <div
          ref={layer}
          className="textLayer"
          style={{ "--scale-factor": width / 595.28 } as React.CSSProperties}
        />
      )}
      {error && (
        <div className="page-error">
          <AlertCircle size={18} />
          <span>Page unavailable</span>
        </div>
      )}
      {visible && displayViewport && !error && overlay?.(displayViewport)}
    </div>
  );
}
