import { parentPort } from "node:worker_threads";
import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
} from "pdf-lib";
import { PNG } from "pngjs";
import {
  imageLayout,
  inspectImage,
  type ImageOptions,
} from "../shared/conversion";

let pdf: PDFDocument | undefined;
parentPort!.on("message", async (message) => {
  try {
    let value: unknown;
    if (message.action === "start") {
      pdf = await PDFDocument.create();
      pdf.setProducer("Paperin offline converter");
      pdf.setCreator("Paperin");
    } else if (message.action === "image") {
      const dims = inspectImage(message.bytes);
      const image =
        dims.mimeType === "image/png"
          ? await pdf!.embedPng(message.bytes)
          : await pdf!.embedJpg(message.bytes);
      const l = imageLayout(
        image.width,
        image.height,
        message.options as ImageOptions,
      );
      const page = pdf!.addPage([l.pageWidth, l.pageHeight]);
      page.drawRectangle({
        width: l.pageWidth,
        height: l.pageHeight,
        color: rgb(1, 1, 1),
      });
      page.pushOperators(
        pushGraphicsState(),
        rectangle(l.margin, l.margin, l.areaWidth, l.areaHeight),
        clip(),
        endPath(),
      );
      page.drawImage(image, {
        x: l.x,
        y: l.pageHeight - l.y - l.drawHeight,
        width: l.drawWidth,
        height: l.drawHeight,
      });
      page.pushOperators(popGraphicsState());
    } else if (message.action === "finish") {
      const bytes = await pdf!.save();
      const checked = await PDFDocument.load(bytes);
      if (checked.getPageCount() !== message.count)
        throw new Error("Couldn't validate the converted PDF.");
      value = bytes;
    } else if (message.action === "validate") {
      const dims = inspectImage(message.bytes);
      if (dims.mimeType !== message.mimeType)
        throw new Error("The output format is invalid.");
      if (dims.mimeType === "image/png")
        PNG.sync.read(Buffer.from(message.bytes), { checkCRC: true });
      value = dims;
    }
    parentPort!.postMessage({ ok: true, value });
  } catch (error) {
    parentPort!.postMessage({
      ok: false,
      error:
        error instanceof Error ? error.message : "Couldn't convert this file.",
    });
  }
});
