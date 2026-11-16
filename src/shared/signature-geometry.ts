import type { SignaturePlacement } from "./signature";
export type Rect = { x: number; y: number; width: number; height: number };
export type Viewport = {
  scale?: number;
  width: number;
  height: number;
  transform: number[];
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
};
export function viewportScale(v: Viewport) {
  return Math.hypot(v.transform[0], v.transform[1]);
}
export function toPdfRect(v: Viewport, rect: Rect): Rect {
  const [x, y] = v.convertToPdfPoint(rect.x, rect.y + rect.height);
  const scale = viewportScale(v);
  return { x, y, width: rect.width / scale, height: rect.height / scale };
}
export function toScreenRect(v: Viewport, p: Rect): Rect {
  const [x, bottom] = v.convertToViewportPoint(p.x, p.y);
  const scale = viewportScale(v);
  return {
    x,
    y: bottom - p.height * scale,
    width: p.width * scale,
    height: p.height * scale,
  };
}
export function clampRect(rect: Rect, width: number, height: number): Rect {
  const w = Math.min(width, Math.max(0.01, rect.width));
  const h = Math.min(height, Math.max(0.01, rect.height));
  return {
    x: Math.max(0, Math.min(width - w, rect.x)),
    y: Math.max(0, Math.min(height - h, rect.y)),
    width: w,
    height: h,
  };
}
export function fitRect(rect: Rect, width: number, height: number): Rect {
  const factor = Math.min(1, width / rect.width, height / rect.height);
  return clampRect(
    { ...rect, width: rect.width * factor, height: rect.height * factor },
    width,
    height,
  );
}
export function placementCorners(p: SignaturePlacement, angle: number) {
  const r = (angle * Math.PI) / 180,
    c = Math.round(Math.cos(r)),
    s = Math.round(Math.sin(r));
  return [
    [0, 0],
    [p.width, 0],
    [0, p.height],
    [p.width, p.height],
  ].map(([x, y]) => [p.x + c * x - s * y, p.y + s * x + c * y]);
}
