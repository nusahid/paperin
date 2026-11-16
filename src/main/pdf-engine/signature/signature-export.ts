import { PDFDocument, PDFArray, PDFDict, PDFName, degrees } from "pdf-lib";
import type {
  SignatureImage,
  SignaturePlacement,
} from "../../../shared/signature";
import { placementCorners } from "../../../shared/signature-geometry";
import { pngForEmbedding } from "./image-validator";

export async function loadSignablePdf(bytes: Uint8Array) {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch {
    throw new Error("This PDF couldn't be opened for signing.");
  }
  if (pdf.isEncrypted)
    throw new Error(
      "This PDF is protected and cannot be signed using this tool.",
    );
  // Inspect parsed dictionaries, including indirect/compressed signature objects,
  // rather than scanning raw bytes (which misses object streams).
  const pending: unknown[] = pdf.context
    .enumerateIndirectObjects()
    .map(([, object]) => object);
  const visited = new Set<unknown>();
  while (pending.length) {
    const object = pending.pop();
    if (visited.has(object)) continue;
    visited.add(object);
    if (object instanceof PDFArray) pending.push(...object.asArray());
    if (!(object instanceof PDFDict)) continue;
    const type = object.lookup(PDFName.of("Type"));
    const fieldType = object.lookup(PDFName.of("FT"));
    if (
      type === PDFName.of("Sig") ||
      fieldType === PDFName.of("Sig") ||
      object.has(PDFName.of("ByteRange")) ||
      object.has(PDFName.of("DocMDP"))
    )
      throw new Error(
        "This document contains a digital signature. Editing it may invalidate the existing signature.",
      );
    pending.push(...object.entries().map(([, value]) => value));
  }
  return pdf;
}

export async function createSignedPdf(
  bytes: Uint8Array,
  placements: SignaturePlacement[],
  images: SignatureImage[],
) {
  const pdf = await loadSignablePdf(bytes);
  if (!placements.length) throw new Error("Add a signature before saving.");
  const pages = pdf.getPages();
  const embedded = new Map<
    string,
    Awaited<ReturnType<PDFDocument["embedPng"]>>
  >();
  for (const p of placements) {
    const page = pages[p.pageIndex];
    if (!page)
      throw new Error("A signature refers to a page that doesn't exist.");
    const angle = ((page.getRotation().angle % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(angle))
      throw new Error("This page rotation isn't supported.");
    const crop = page.getCropBox(),
      media = page.getMediaBox();
    const left = Math.max(crop.x, media.x),
      bottom = Math.max(crop.y, media.y);
    const right = Math.min(crop.x + crop.width, media.x + media.width);
    const top = Math.min(crop.y + crop.height, media.y + media.height);
    if (
      placementCorners(p, angle).some(
        ([x, y]) =>
          x < left - 0.01 ||
          x > right + 0.01 ||
          y < bottom - 0.01 ||
          y > top + 0.01,
      )
    )
      throw new Error("Keep each signature inside the visible page.");
    if (!embedded.has(p.imageId)) {
      const image = images.find((i) => i.id === p.imageId);
      if (!image)
        throw new Error(
          "This signature image is no longer available. Choose it again.",
        );
      const png = pngForEmbedding(image.name, image.bytes);
      try {
        embedded.set(image.id, await pdf.embedPng(png));
      } catch {
        throw new Error("This image couldn't be opened.");
      }
    }
    page.drawImage(embedded.get(p.imageId)!, {
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      rotate: degrees(angle),
      opacity: 1,
    });
  }
  const output = await pdf.save();
  const check = await PDFDocument.load(output);
  if (check.getPageCount() !== pages.length)
    throw new Error("Couldn't save the signed PDF.");
  return output;
}
