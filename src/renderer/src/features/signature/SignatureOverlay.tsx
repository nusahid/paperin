import { useEffect, useRef, useState } from "react";
import type { SignaturePlacement } from "../../../../shared/signature";
import {
  clampRect,
  fitRect,
  toPdfRect,
  toScreenRect,
  viewportScale,
  type Rect,
  type Viewport,
} from "../../../../shared/signature-geometry";
import { useApp } from "../../store";
import { useSignature } from "./signature.store";

type Gesture = {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  rect: Rect;
  corner?: string;
};
export function SignatureOverlay({
  viewport: v,
  pageIndex,
}: {
  viewport: Viewport;
  pageIndex: number;
}) {
  const s = useSignature();
  const busy = useApp((a) => a.busy);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<{ id: string; rect: Rect } | null>(null);
  const draftRef = useRef(draft);
  const [ghost, setGhost] = useState<Rect | null>(null);
  const image = s.images.find((i) => i.id === s.current.imageId);
  const placements = s.current.placements.filter(
    (p) => p.pageIndex === pageIndex,
  );
  const selected = placements.find((p) => p.id === s.selectedId);
  function updateDraft(value: typeof draft) {
    draftRef.current = value;
    setDraft(value);
  }
  function point(event: React.PointerEvent) {
    const bounds = root.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * v.width) / bounds.width,
      y: ((event.clientY - bounds.top) * v.height) / bounds.height,
    };
  }
  function ghostAt(x: number, y: number) {
    if (!image) return null;
    const w = Math.min(
      v.width * 0.3,
      ((50 * 72) / 25.4) * (v.scale ?? viewportScale(v)),
    );
    return fitRect(
      {
        x: x - w / 2,
        y: y - (w * image.heightPx) / image.widthPx / 2,
        width: w,
        height: (w * image.heightPx) / image.widthPx,
      },
      v.width,
      v.height,
    );
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        busy ||
        document.querySelector("dialog[open]") ||
        (event.target as HTMLElement).closest("input,select,textarea")
      )
        return;
      if (event.key === "Escape" && gesture.current) {
        gesture.current = null;
        updateDraft(null);
        event.preventDefault();
        return;
      }
      if (
        !selected ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      const step = (event.shiftKey ? 10 : 1) * (v.scale ?? viewportScale(v));
      const rect = toScreenRect(v, selected);
      const moved = clampRect(
        {
          ...rect,
          x:
            rect.x +
            (event.key === "ArrowLeft"
              ? -step
              : event.key === "ArrowRight"
                ? step
                : 0),
          y:
            rect.y +
            (event.key === "ArrowUp"
              ? -step
              : event.key === "ArrowDown"
                ? step
                : 0),
        },
        v.width,
        v.height,
      );
      s.update(selected.id, toPdfRect(v, moved));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, v, busy]);
  // Changing page geometry or history cancels a pending gesture.
  useEffect(() => {
    gesture.current = null;
    updateDraft(null);
    setGhost(null);
  }, [v.width, v.height, s.current]);
  function start(
    event: React.PointerEvent<HTMLDivElement>,
    p: SignaturePlacement,
  ) {
    if (busy || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const pt = point(event);
    s.select(p.id);
    gesture.current = {
      id: p.id,
      pointerId: event.pointerId,
      ...pt,
      rect: toScreenRect(v, p),
      corner: (event.target as HTMLElement).dataset.corner,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: React.PointerEvent) {
    if (busy) return;
    const pt = point(event),
      g = gesture.current;
    if (!g) {
      if (s.placing) setGhost(ghostAt(pt.x, pt.y));
      return;
    }
    const dx = pt.x - g.x,
      dy = pt.y - g.y;
    let rect: Rect;
    if (!g.corner)
      rect = clampRect(
        { ...g.rect, x: g.rect.x + dx, y: g.rect.y + dy },
        v.width,
        v.height,
      );
    else {
      const west = g.corner.includes("w"),
        north = g.corner.includes("n");
      const anchorX = west ? g.rect.x + g.rect.width : g.rect.x;
      const anchorY = north ? g.rect.y + g.rect.height : g.rect.y;
      const maxW = west ? anchorX : v.width - anchorX,
        maxH = north ? anchorY : v.height - anchorY;
      let w = Math.max(
        Math.min(viewportScale(v), maxW),
        Math.min(maxW, g.rect.width + (west ? -dx : dx)),
      );
      let h = Math.max(
        Math.min(viewportScale(v), maxH),
        Math.min(maxH, g.rect.height + (north ? -dy : dy)),
      );
      if (s.locked) {
        const ratio = g.rect.width / g.rect.height;
        const requested = Math.abs(dx) >= Math.abs(dy * ratio) ? w : h * ratio;
        w = Math.min(requested, maxW, maxH * ratio);
        h = w / ratio;
      }
      rect = {
        x: west ? anchorX - w : anchorX,
        y: north ? anchorY - h : anchorY,
        width: w,
        height: h,
      };
    }
    updateDraft({ id: g.id, rect });
  }
  function finish(event: React.PointerEvent) {
    const g = gesture.current;
    if (!g || event.pointerId !== g.pointerId) return;
    const final = draftRef.current;
    gesture.current = null;
    updateDraft(null);
    if (final && !busy) s.update(g.id, toPdfRect(v, final.rect));
  }
  return (
    <div
      ref={root}
      tabIndex={-1}
      className={`signature-overlay ${s.placing ? "is-placing" : ""}`}
      aria-label={`Signature editor page ${pageIndex + 1}`}
      onPointerMove={move}
      onPointerLeave={() => {
        if (!gesture.current) setGhost(null);
      }}
      onPointerDown={(event) => {
        if (busy || event.button !== 0 || event.target !== event.currentTarget)
          return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        if (s.placing && image) {
          const pt = point(event),
            rect = ghostAt(pt.x, pt.y)!;
          s.add({
            id: crypto.randomUUID(),
            imageId: image.id,
            pageIndex,
            ...toPdfRect(v, rect),
            opacity: 1,
            rotation: 0,
          });
          setGhost(null);
        } else s.select(null);
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        gesture.current = null;
        updateDraft(null);
      }}
    >
      {placements.map((p) => {
        const asset = s.images.find((i) => i.id === p.imageId);
        const rect = draft?.id === p.id ? draft.rect : toScreenRect(v, p);
        return (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            aria-label={`Signature on page ${pageIndex + 1}`}
            aria-pressed={s.selectedId === p.id}
            className={`signature-placement ${s.selectedId === p.id ? "selected" : ""}`}
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
            }}
            onFocus={() => {
              if (!busy) s.select(p.id);
            }}
            onPointerDown={(e) => start(e, p)}
            onKeyDown={(e) => {
              if (["Enter", " "].includes(e.key)) {
                e.preventDefault();
                s.select(p.id);
              }
            }}
          >
            <img src={asset?.url} draggable={false} alt="" />
            {s.selectedId === p.id &&
              ["nw", "ne", "sw", "se"].map((corner) => (
                <span
                  key={corner}
                  className={`signature-handle ${corner}`}
                  data-corner={corner}
                />
              ))}
          </div>
        );
      })}
      {s.placing && ghost && image && (
        <img
          className="signature-ghost"
          src={image.url}
          alt=""
          style={{
            left: ghost.x,
            top: ghost.y,
            width: ghost.width,
            height: ghost.height,
          }}
        />
      )}
    </div>
  );
}
