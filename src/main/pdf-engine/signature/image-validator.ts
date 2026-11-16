import { PNG } from "pngjs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { MAX_PNG_BYTES, MAX_PNG_PIXELS } from "../../../shared/signature";

export function validatePng(name: string, bytes: Uint8Array) {
  if (
    path.extname(name).toLowerCase() !== ".png" ||
    !Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  )
    throw new Error("Please choose a PNG image.");
  if (bytes.length > MAX_PNG_BYTES)
    throw new Error("This image exceeds the supported size.");
  const data = Buffer.from(bytes);
  if (
    data.length < 33 ||
    data.toString("ascii", 12, 16) !== "IHDR" ||
    data.readUInt32BE(8) !== 13
  )
    throw new Error("This image couldn't be opened.");
  const widthPx = data.readUInt32BE(16),
    heightPx = data.readUInt32BE(20);
  if (!widthPx || !heightPx) throw new Error("This image couldn't be opened.");
  if (
    widthPx > 16384 ||
    heightPx > 16384 ||
    widthPx * heightPx > MAX_PNG_PIXELS
  )
    throw new Error("This image exceeds the supported size.");
  // Reject animated images before either decoder allocates animation frames.
  const compressed: Buffer[] = [];
  let offset = 8,
    ended = false;
  for (; offset + 12 <= data.length;) {
    const length = data.readUInt32BE(offset);
    if (length > data.length - offset - 12)
      throw new Error("This image couldn't be opened.");
    const type = data.toString("ascii", offset + 4, offset + 8);
    if (type === "IHDR" && offset !== 8)
      throw new Error("This image couldn't be opened.");
    if (type === "IDAT")
      compressed.push(data.subarray(offset + 8, offset + 8 + length));
    if (["acTL", "fcTL", "fdAT"].includes(type))
      throw new Error(
        "Please choose a still PNG image. Animated PNGs aren't supported.",
      );
    offset += length + 12;
    if (type === "IEND") {
      ended = length === 0;
      break;
    }
  }
  try {
    if (!ended || offset !== data.length || !compressed.length)
      throw new Error();
    // pngjs' interlaced path otherwise inflates without a size limit.
    inflateSync(Buffer.concat(compressed), {
      maxOutputLength: widthPx * heightPx * 8 + heightPx * 8 + 1024,
    });
    const decoded = PNG.sync.read(data, { checkCRC: true });
    if (
      decoded.width !== widthPx ||
      decoded.height !== heightPx ||
      decoded.data.length !== widthPx * heightPx * 4
    )
      throw new Error();
  } catch {
    throw new Error("This image couldn't be opened.");
  }
  return { widthPx, heightPx };
}

export function pngForEmbedding(name: string, bytes: Uint8Array) {
  validatePng(name, bytes);
  const data = Buffer.from(bytes),
    chunks = [data.subarray(0, 8)];
  // Only pixel-defining chunks reach pdf-lib's decoder. Ancillary text and
  // application metadata have no role in a signature's PDF image object.
  for (let offset = 8; offset + 12 <= data.length;) {
    const end = offset + data.readUInt32BE(offset) + 12;
    if (
      ["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(
        data.toString("ascii", offset + 4, offset + 8),
      )
    )
      chunks.push(data.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}
