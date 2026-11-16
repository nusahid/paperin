import { Worker } from "node:worker_threads";
import path from "node:path";

// Parsing, image decoding, and PDF writing stay off Electron's UI thread.
export function signatureJob<T>(job: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "signature-worker.js"), {
      workerData: job,
    });
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(new Error("PDF processing timed out. Try a smaller document."));
    }, 120_000);
    worker.once("message", (result) => {
      clearTimeout(timer);
      if (result.ok) resolve(result.value);
      else reject(new Error(result.error));
    });
    worker.once("error", () => {
      clearTimeout(timer);
      reject(
        new Error(
          "Couldn't process this file. Try a smaller document or image.",
        ),
      );
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        reject(
          new Error(
            "Couldn't process this file. Try a smaller document or image.",
          ),
        );
    });
  });
}
