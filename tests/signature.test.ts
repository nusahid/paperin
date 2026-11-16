import { beforeAll, describe, expect, it } from "vitest";
import {
  PDFDocument,
  PDFArray,
  PDFName,
  PDFNumber,
  StandardFonts,
  degrees,
  rgb,
} from "pdf-lib";
import { PNG } from "pngjs";
import { randomUUID, createHash } from "node:crypto";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { validatePng } from "../src/main/pdf-engine/signature/image-validator";
import {
  createSignedPdf,
  loadSignablePdf,
} from "../src/main/pdf-engine/signature/signature-export";
import { toPdfRect, toScreenRect } from "../src/shared/signature-geometry";
import {
  signatureExportSchema,
  type SignatureImage,
  type SignaturePlacement,
} from "../src/shared/signature";
let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
beforeAll(async () => {
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
});
function png() {
  const img = new PNG({ width: 90, height: 30 });
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = 25;
      img.data[i + 1] = 80;
      img.data[i + 2] = 200;
      img.data[i + 3] = x < 30 ? 0 : x < 60 ? 128 : 255;
    }
  return PNG.sync.write(img);
}
function image(): SignatureImage {
  return {
    id: randomUUID(),
    name: "signature.png",
    mimeType: "image/png",
    widthPx: 90,
    heightPx: 30,
    bytes: png(),
  };
}
async function fixture(rotations = [0, 90, 180, 270], userUnit = 1) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const rotation of rotations) {
    const page = pdf.addPage([500, 420]);
    page.setCropBox(40, 70, 400, 300);
    page.setRotation(degrees(rotation));
    page.node.set(PDFName.of("UserUnit"), PDFNumber.of(userUnit));
    page.drawRectangle({
      x: 40,
      y: 70,
      width: 400,
      height: 300,
      color: rgb(0.9, 0.8, 0.6),
    });
    page.drawText("Selectable original text", {
      x: 70,
      y: 300,
      font,
      size: 14,
    });
  }
  return pdf.save();
}
describe("signature PNG validation", () => {
  it("decodes a transparent PNG without changing its bytes", () => {
    const bytes = png(),
      original = Buffer.from(bytes);
    expect(validatePng("Signature.PNG", bytes)).toEqual({
      widthPx: 90,
      heightPx: 30,
    });
    expect(bytes).toEqual(original);
  });
  it("rejects renamed files, wrong extensions, truncated data and corrupt CRC", () => {
    expect(() => validatePng("fake.png", Buffer.from("JPEG"))).toThrow(
      "choose a PNG",
    );
    expect(() => validatePng("sig.jpg", png())).toThrow("choose a PNG");
    expect(() => validatePng("sig.png", png().subarray(0, 35))).toThrow(
      "couldn't be opened",
    );
    const bad = png();
    bad[29] ^= 1;
    expect(() => validatePng("sig.png", bad)).toThrow("couldn't be opened");
  });
  it("rejects oversized bytes and dimensions before decoding", () => {
    const header = png();
    header.writeUInt32BE(1_000_000, 16);
    expect(() => validatePng("sig.png", header)).toThrow("supported size");
    const huge = Buffer.alloc(15 * 1024 * 1024 + 1);
    png().copy(huge);
    expect(() => validatePng("sig.png", huge)).toThrow("supported size");
  });
});
describe("signature PDF output", () => {
  it.each([1, 2])(
    "matches the PDF.js preview at every page rotation, CropBox offset and zoom (UserUnit %i)",
    async (unit) => {
      const bytes = await fixture(undefined, unit),
        img = image();
      const hash = createHash("sha256").update(bytes).digest("hex");
      const sourceTask = pdfjs.getDocument({
        data: bytes.slice(),
        useSystemFonts: true,
      });
      const source = await sourceTask.promise;
      const placements: SignaturePlacement[] = [];
      for (let i = 0; i < 4; i++) {
        const page = await source.getPage(i + 1),
          v = page.getViewport({ scale: 1 });
        const rect = {
          x: 60 * unit,
          y: 100 * unit,
          width: 90 * unit,
          height: 30 * unit,
        };
        const p: SignaturePlacement = {
          id: randomUUID(),
          imageId: img.id,
          pageIndex: i,
          ...toPdfRect(v, rect),
          opacity: 1,
          rotation: 0,
        };
        for (const scale of [0.5, 1, 2]) {
          const zoomed = toScreenRect(page.getViewport({ scale }), p);
          expect(zoomed.x).toBeCloseTo(rect.x * scale);
          expect(zoomed.y).toBeCloseTo(rect.y * scale);
          expect(zoomed.width).toBeCloseTo(rect.width * scale);
          expect(zoomed.height).toBeCloseTo(rect.height * scale);
        }
        placements.push(p);
      }
      const result = await createSignedPdf(bytes, placements, [img]);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(hash);
      const signedTask = pdfjs.getDocument({
        data: result.slice(),
        useSystemFonts: true,
      });
      const signed = await signedTask.promise;
      expect(signed.numPages).toBe(4);
      const pngImage = await loadImage(Buffer.from(img.bytes));
      for (let i = 0; i < 4; i++) {
        const a = await source.getPage(i + 1),
          b = await signed.getPage(i + 1),
          v = a.getViewport({ scale: 1 });
        const expected = createCanvas(v.width, v.height),
          actual = createCanvas(v.width, v.height);
        await a.render({ canvas: expected as any, viewport: v }).promise;
        const rect = toScreenRect(v, placements[i]);
        expected
          .getContext("2d")
          .drawImage(pngImage, rect.x, rect.y, rect.width, rect.height);
        await b.render({ canvas: actual as any, viewport: v }).promise;
        const e = expected
          .getContext("2d")
          .getImageData(0, 0, v.width, v.height).data;
        const r = actual
          .getContext("2d")
          .getImageData(0, 0, v.width, v.height).data;
        let different = 0;
        for (let n = 0; n < e.length; n += 4)
          if ([0, 1, 2].some((c) => Math.abs(e[n + c] - r[n + c]) > 3))
            different++;
        expect(different, `rotation ${i * 90}, unit ${unit}`).toBeLessThan(
          v.width * v.height * 0.001,
        );
        const text = await b.getTextContent();
        expect(text.items.map((x: any) => x.str).join(" ")).toContain(
          "Selectable original text",
        );
      }
      await sourceTask.destroy();
      await signedTask.destroy();
    },
  );
  it("keeps untouched pages and rejects missing images or off-page placements", async () => {
    const bytes = await fixture(),
      img = image();
    const p: SignaturePlacement = {
      id: randomUUID(),
      imageId: img.id,
      pageIndex: 0,
      x: 70,
      y: 100,
      width: 90,
      height: 30,
      opacity: 1,
      rotation: 0,
    };
    expect(
      (
        await PDFDocument.load(await createSignedPdf(bytes, [p], [img]))
      ).getPageCount(),
    ).toBe(4);
    await expect(createSignedPdf(bytes, [p], [])).rejects.toThrow(
      "no longer available",
    );
    await expect(
      createSignedPdf(bytes, [{ ...p, x: -10 }], [img]),
    ).rejects.toThrow("inside the visible page");
    await expect(
      createSignedPdf(bytes, [{ ...p, pageIndex: 5 }], [img]),
    ).rejects.toThrow("doesn't exist");
  });
  it("blocks parsed signature dictionaries even inside compressed object streams", async () => {
    const pdf = await PDFDocument.load(await fixture([0]));
    const signature = pdf.context.obj({
      Type: "Sig",
      ByteRange: [0, 100, 200, 50],
    });
    const ref = pdf.context.register(signature);
    pdf.catalog.set(PDFName.of("AcroForm"), pdf.context.obj({ Fields: [ref] }));
    await expect(
      loadSignablePdf(await pdf.save({ useObjectStreams: true })),
    ).rejects.toThrow("contains a digital signature");
  });
  it("rejects non-finite coordinates, unsupported opacity, invalid pages, and empty plans at IPC", () => {
    const p = {
      id: randomUUID(),
      imageId: randomUUID(),
      pageIndex: 0,
      x: 1,
      y: 1,
      width: 2,
      height: 2,
      opacity: 1,
      rotation: 0,
    };
    for (const patch of [
      { x: NaN },
      { y: Infinity },
      { width: 0 },
      { pageIndex: -1 },
      { opacity: 0.5 },
      { rotation: 90 },
    ])
      expect(
        signatureExportSchema.safeParse({
          sessionId: randomUUID(),
          placements: [{ ...p, ...patch }],
        }).success,
      ).toBe(false);
    expect(
      signatureExportSchema.safeParse({
        sessionId: randomUUID(),
        placements: [],
      }).success,
    ).toBe(false);
  });
  it("allows unsigned form fields while conservatively blocking signature fields", async () => {
    const pdf = await PDFDocument.load(await fixture([0]));
    const dict = pdf.context.obj({});
    dict.set(PDFName.of("FT"), PDFName.of("Sig"));
    dict.set(PDFName.of("Kids"), PDFArray.withContext(pdf.context));
    const ref = pdf.context.register(dict);
    pdf.catalog.set(PDFName.of("AcroForm"), pdf.context.obj({ Fields: [ref] }));
    await expect(loadSignablePdf(await pdf.save())).rejects.toThrow(
      "digital signature",
    );
  });
});
