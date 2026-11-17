import type { RenderTask } from "pdfjs-dist";
import {
  inspectImage,
  imageLayout,
  rasterSize,
  type ConversionInput,
  type ImageOptions,
} from "../../../../shared/conversion";
import type { Document } from "../../store";
import type { Result } from "../../../../shared/types";
import type { ImageItem } from "./store";

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function blob(bytes: Uint8Array) {
  return new Blob([new Uint8Array(bytes).buffer]);
}
export function encode(
  canvas: HTMLCanvasElement,
  format = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Couldn't encode the converted image.")),
      format,
      quality,
    ),
  );
}
async function bitmap(id: string) {
  const bytes = unwrap(await window.paperin.conversionRead(id));
  inspectImage(bytes);
  // Chromium applies all EXIF orientations here, including reflected orientations.
  return createImageBitmap(blob(bytes), { imageOrientation: "from-image" });
}
export async function importImage(input: ConversionInput): Promise<ImageItem> {
  const decoded = await bitmap(input.id);
  const canvas = document.createElement("canvas");
  try {
    const ratio = Math.min(1, 260 / Math.max(decoded.width, decoded.height));
    canvas.width = Math.max(1, Math.round(decoded.width * ratio));
    canvas.height = Math.max(1, Math.round(decoded.height * ratio));
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded, 0, 0, canvas.width, canvas.height);
    return {
      ...input,
      width: decoded.width,
      height: decoded.height,
      thumbnail: URL.createObjectURL(await encode(canvas)),
      rotation: 0,
    };
  } finally {
    decoded.close();
    canvas.width = canvas.height = 1;
  }
}
export function dimensions(item: ImageItem) {
  return item.rotation % 180
    ? { width: item.height, height: item.width }
    : { width: item.width, height: item.height };
}
function drawRotated(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  rotation: number,
) {
  context.translate(context.canvas.width / 2, context.canvas.height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(image, -width / 2, -height / 2, width, height);
}
export async function prepareImage(item: ImageItem) {
  const decoded = await bitmap(item.id),
    canvas = document.createElement("canvas");
  try {
    const dims = dimensions(item);
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawRotated(ctx, decoded, decoded.width, decoded.height, item.rotation);
    // A normalized PNG preserves pixels and avoids reapplying EXIF in PDF readers.
    return new Uint8Array(await (await encode(canvas)).arrayBuffer());
  } finally {
    decoded.close();
    canvas.width = canvas.height = 1;
  }
}
export async function drawComposition(
  canvas: HTMLCanvasElement,
  item: ImageItem,
  options: ImageOptions,
  width = 320,
) {
  const dims = dimensions(item),
    layout = imageLayout(dims.width, dims.height, options);
  const image = new Image();
  image.src = item.thumbnail;
  await image.decode();
  const thumb = await createImageBitmap(image);
  const rotated = document.createElement("canvas");
  try {
    rotated.width = item.rotation % 180 ? thumb.height : thumb.width;
    rotated.height = item.rotation % 180 ? thumb.width : thumb.height;
    drawRotated(
      rotated.getContext("2d")!,
      thumb,
      thumb.width,
      thumb.height,
      item.rotation,
    );
    const scale = width / layout.pageWidth;
    canvas.width = width;
    canvas.height = Math.ceil(layout.pageHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.rect(layout.margin, layout.margin, layout.areaWidth, layout.areaHeight);
    ctx.clip();
    ctx.drawImage(
      rotated,
      layout.x,
      layout.y,
      layout.drawWidth,
      layout.drawHeight,
    );
    return layout;
  } finally {
    thumb.close();
    rotated.width = rotated.height = 1;
  }
}
export async function renderPdfImage(
  doc: Document,
  page: number,
  dpi: number,
  format: "jpeg" | "png",
  quality: number,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const source = await doc.pdf.getPage(page);
  const viewport = source.getViewport({ scale: dpi / 72 });
  const natural = source.getViewport({ scale: 1 });
  const dims = rasterSize(natural.width, natural.height, dpi);
  const canvas = document.createElement("canvas");
  let task: RenderTask | undefined;
  const cancel = () => task?.cancel();
  signal.addEventListener("abort", cancel);
  try {
    signal.throwIfAborted();
    canvas.width = dims.width;
    canvas.height = dims.height;
    task = source.render({ canvas, viewport, background: "rgb(255,255,255)" });
    await task.promise;
    signal.throwIfAborted();
    const output = await encode(
      canvas,
      `image/${format}`,
      format === "jpeg" ? quality : undefined,
    );
    signal.throwIfAborted();
    const bytes = new Uint8Array(await output.arrayBuffer());
    const checked = inspectImage(bytes);
    if (
      checked.width !== dims.width ||
      checked.height !== dims.height ||
      checked.mimeType !== `image/${format}`
    )
      throw new Error("Couldn't validate the converted image.");
    return { bytes, ...dims };
  } finally {
    signal.removeEventListener("abort", cancel);
    canvas.width = canvas.height = 1;
    source.cleanup();
  }
}
