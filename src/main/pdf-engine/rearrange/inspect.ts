import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  PDFDocument,
  PDFDict,
  PDFArray,
  PDFRef,
  PDFRawStream,
  PDFName,
  type PDFObject,
} from "pdf-lib";

export async function inspectRearrange(location: string) {
  const pdf = await PDFDocument.load(await fs.readFile(location), {
    updateMetadata: false,
  });
  const pending: PDFObject[] = pdf.context
    .enumerateIndirectObjects()
    .map(([, object]) => object);
  const visited = new Set<PDFObject>();
  let signature = false;
  while (pending.length) {
    const object = pending.pop()!;
    if (visited.has(object)) continue;
    visited.add(object);
    if (object instanceof PDFArray) pending.push(...object.asArray());
    const dict = object instanceof PDFRawStream ? object.dict : object;
    if (!(dict instanceof PDFDict)) continue;
    if (
      dict.has(PDFName.of("ByteRange")) ||
      dict.has(PDFName.of("DocMDP")) ||
      dict.lookup(PDFName.of("Type")) === PDFName.of("Sig") ||
      dict.lookup(PDFName.of("FT")) === PDFName.of("Sig")
    )
      signature = true;
    pending.push(...dict.entries().map(([, value]) => value));
  }
  const warnings: string[] = [];
  if (pdf.catalog.has(PDFName.of("Outlines")))
    warnings.push("Review bookmarks and document links after saving.");
  if (pdf.catalog.has(PDFName.of("PageLabels")))
    warnings.push(
      "This PDF has custom page labels. Review their order after saving.",
    );
  if (pdf.catalog.has(PDFName.of("AcroForm")))
    warnings.push(
      "This PDF has interactive forms. Review field behavior after saving.",
    );
  const memo = new Map<string, string>();
  const hash = (value: string | Uint8Array) =>
    createHash("sha256").update(value).digest("hex");
  const canonical = (
    object: PDFObject | undefined,
    visiting = new Set<string>(),
  ): string => {
    if (!object) return "null";
    if (object instanceof PDFRef) {
      const key = object.toString();
      if (visiting.has(key)) return "cycle";
      if (memo.has(key)) return memo.get(key)!;
      const next = new Set(visiting);
      next.add(key);
      const result = canonical(pdf.context.lookup(object), next);
      memo.set(key, result);
      return result;
    }
    if (object instanceof PDFRawStream)
      return hash(canonical(object.dict, visiting) + hash(object.contents));
    if (object instanceof PDFArray)
      return hash(
        object
          .asArray()
          .map((item) => canonical(item, visiting))
          .join("|"),
      );
    if (object instanceof PDFDict)
      return hash(
        object
          .entries()
          .filter(
            ([key]) =>
              !["/Length", "/Parent", "/P", "/Dest", "/A"].includes(
                key.toString(),
              ),
          )
          .sort(([a], [b]) => a.toString().localeCompare(b.toString()))
          .map(([key, value]) => `${key}:${canonical(value, visiting)}`)
          .join("|"),
      );
    return object.toString();
  };
  const fingerprints = pdf
    .getPages()
    .map((page) =>
      hash(
        [
          canonical(page.node.Contents()),
          canonical(page.node.Resources()),
          canonical(page.node.Annots()),
          JSON.stringify(page.getMediaBox()),
          JSON.stringify(page.getCropBox()),
          JSON.stringify(page.getBleedBox()),
          JSON.stringify(page.getTrimBox()),
          JSON.stringify(page.getArtBox()),
          page.getRotation().angle,
        ].join("|"),
      ),
    );
  return {
    pageCount: pdf.getPageCount(),
    warnings,
    fingerprints,
    blocked: signature
      ? "This PDF contains a digital signature or signature field and can't be rearranged safely."
      : null,
  };
}
