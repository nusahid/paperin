import { parentPort, workerData } from "node:worker_threads";
import {
  createSignedPdf,
  loadSignablePdf,
} from "./pdf-engine/signature/signature-export";
import { validatePng } from "./pdf-engine/signature/image-validator";

async function run() {
  try {
    const job = workerData;
    const value =
      job.action === "image"
        ? validatePng(job.name, job.bytes)
        : job.action === "inspect"
          ? (await loadSignablePdf(job.bytes)).getPageCount()
          : await createSignedPdf(job.bytes, job.placements, job.images);
    parentPort!.postMessage({ ok: true, value });
  } catch (error) {
    parentPort!.postMessage({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Couldn't save the signed PDF.",
    });
  }
}
void run();
