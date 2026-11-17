import { z } from "zod";

export const MAX_PIXELS = 40_000_000;
export const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
export const MAX_BATCH_BYTES = 512 * 1024 * 1024;
export const imageOptionsSchema = z
  .object({
    pageSize: z.enum(["A4", "A5", "LETTER", "LEGAL", "MATCH_IMAGE"]),
    orientation: z.enum(["auto", "portrait", "landscape"]),
    fitting: z.enum(["contain", "cover", "stretch"]),
    marginMm: z.union([
      z.literal(0),
      z.literal(5),
      z.literal(10),
      z.literal(20),
    ]),
  })
  .strict();
export type ImageOptions = z.infer<typeof imageOptionsSchema>;
export const defaultImageOptions: ImageOptions = {
  pageSize: "A4",
  orientation: "auto",
  fitting: "contain",
  marginMm: 10,
};
export const conversionPlanSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("image-to-pdf"),
      imageIds: z.array(z.string().uuid()).min(1).max(100000),
      options: imageOptionsSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("pdf-to-image"),
      sourceId: z.string().uuid(),
      pages: z.array(z.number().int().positive()).min(1).max(100000),
      format: z.enum(["jpeg", "png"]),
      dpi: z.union([
        z.literal(72),
        z.literal(150),
        z.literal(200),
        z.literal(300),
      ]),
      quality: z.number().min(0.6).max(0.98),
    })
    .strict(),
]);
export type ConversionPlan = z.infer<typeof conversionPlanSchema>;
export type ConversionInput = {
  id: string;
  name: string;
  size: number;
  kind: "image" | "pdf";
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
};
export type ConversionImport = { files: ConversionInput[]; errors: string[] };
export type ConversionStart = { id: string; total: number };
export type ConversionResult = {
  status: "completed" | "cancelled" | "failed";
  outputs: { id: string; name: string }[];
  error?: string;
};

// All coordinates use PDF points, with a top-left origin for shared canvas/PDF layout.
export function imageLayout(
  width: number,
  height: number,
  options: ImageOptions,
) {
  if (!(width > 0 && height > 0) || !Number.isFinite(width + height))
    throw new Error("This image couldn't be opened.");
  const mm = 72 / 25.4;
  const sizes = {
    A4: [210 * mm, 297 * mm],
    A5: [148 * mm, 210 * mm],
    LETTER: [612, 792],
    LEGAL: [612, 1008],
  };
  let [pageWidth, pageHeight] =
    options.pageSize === "MATCH_IMAGE"
      ? [
          (595.276 * width) / Math.max(width, height),
          (595.276 * height) / Math.max(width, height),
        ]
      : sizes[options.pageSize];
  const landscape =
    options.orientation === "landscape" ||
    (options.orientation === "auto" && width > height);
  if (options.pageSize !== "MATCH_IMAGE" || options.orientation !== "auto") {
    [pageWidth, pageHeight] = landscape
      ? [Math.max(pageWidth, pageHeight), Math.min(pageWidth, pageHeight)]
      : [Math.min(pageWidth, pageHeight), Math.max(pageWidth, pageHeight)];
  }
  const margin = options.marginMm * mm;
  const areaWidth = pageWidth - margin * 2,
    areaHeight = pageHeight - margin * 2;
  if (areaWidth <= 0 || areaHeight <= 0)
    throw new Error(
      "The margins are too large for this image ratio. Choose a smaller margin.",
    );
  const scale =
    options.fitting === "cover"
      ? Math.max(areaWidth / width, areaHeight / height)
      : Math.min(areaWidth / width, areaHeight / height);
  const drawWidth = options.fitting === "stretch" ? areaWidth : width * scale;
  const drawHeight =
    options.fitting === "stretch" ? areaHeight : height * scale;
  return {
    pageWidth,
    pageHeight,
    margin,
    areaWidth,
    areaHeight,
    x: margin + (areaWidth - drawWidth) / 2,
    y: margin + (areaHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  };
}

export function rasterSize(width: number, height: number, dpi: number) {
  const w = Math.ceil((width * dpi) / 72),
    h = Math.ceil((height * dpi) / 72);
  if (
    !Number.isFinite(w + h) ||
    w <= 0 ||
    h <= 0 ||
    w * h > MAX_PIXELS ||
    w > 32767 ||
    h > 32767
  )
    throw new Error("The selected resolution is too large.");
  return { width: w, height: h };
}

// Check dimensions before any bitmap allocation. Full decoding is checked separately.
export function inspectImage(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const png =
    bytes.length >= 24 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  let width = 0,
    height = 0;
  if (png) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    let at = 2;
    while (at + 4 < bytes.length) {
      if (bytes[at++] !== 255) break;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 8
      ) {
        height = view.getUint16(at + 3);
        width = view.getUint16(at + 5);
        break;
      }
      at += length;
    }
  }
  if (!width || !height) throw new Error("This image couldn't be opened.");
  if (width * height > MAX_PIXELS || width > 32767 || height > 32767)
    throw new Error("This image exceeds the supported 40 megapixel limit.");
  return {
    width,
    height,
    mimeType: png ? ("image/png" as const) : ("image/jpeg" as const),
  };
}
