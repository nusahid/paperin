import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { LocalFile } from "../../shared/types";
import type { Document } from "./store";
GlobalWorkerOptions.workerSrc = worker;
export async function loadPdf(
  file: LocalFile,
  askPassword: (incorrect: boolean) => Promise<string>,
): Promise<Document> {
  const assetRoot = new URL("pdfjs/", window.location.href).href;
  const task = getDocument({
    data: file.bytes,
    cMapUrl: `${assetRoot}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assetRoot}standard_fonts/`,
    wasmUrl: `${assetRoot}wasm/`,
  });
  let password: string | undefined;
  task.onPassword = (update: (password: string) => void, reason: number) => {
    askPassword(reason === 2)
      .then((value) => {
        password = value;
        update(value);
      })
      .catch(() => {
        void task.destroy();
      });
  };
  try {
    const pdf = await task.promise;
    if (password !== undefined)
      await window.paperin.setPassword(file.id, password);
    const warnings: string[] = [];
    const [fields, attachments, signatures] = await Promise.allSettled([
      pdf.getFieldObjects(),
      pdf.getAttachments(),
      pdf.getSignatures(),
    ]);
    if (fields.status === "fulfilled" && fields.value) {
      warnings.push(
        "Interactive form fields may change when pages are reorganized.",
      );
      const signed = [...fields.value.values()]
        .flat()
        .some((field: any) => field.type === "Sig");
      if (signed)
        warnings.push(
          "This PDF has signature fields. Exporting pages can invalidate digital signatures.",
        );
    }
    if (attachments.status === "fulfilled" && attachments.value)
      warnings.push("Embedded attachments may not be included in the output.");
    if (
      signatures.status === "fulfilled" &&
      signatures.value?.length &&
      !warnings.some((w) => w.includes("signature"))
    )
      warnings.push(
        "This PDF has signatures. Exporting pages can invalidate them.",
      );
    return {
      id: file.id,
      name: file.name,
      size: file.size,
      pdf,
      pageCount: pdf.numPages,
      warnings,
      destroy: () => task.destroy(),
    };
  } catch (error: any) {
    if (error.name === "PasswordException")
      throw new Error(
        "This PDF requires a valid password. Please try opening it again.",
      );
    throw new Error(
      "This PDF couldn't be opened. The file may be damaged, unsupported, or the password entry was canceled.",
    );
  }
}
