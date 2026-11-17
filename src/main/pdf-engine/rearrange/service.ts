import { Worker } from "node:worker_threads";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { runQpdf, type RegisteredFile } from "../../pdf-engine";
import { validatePermutation } from "../../../shared/rearrange";
import type { inspectRearrange } from "./inspect";
export type Inspection = Awaited<ReturnType<typeof inspectRearrange>>;

export function inspectJob(
  location: string,
  signal?: AbortSignal,
): Promise<Inspection> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(path.join(__dirname, "rearrange-worker.js"), {
      workerData: { location },
    });
    const abort = () => {
      void worker
        .terminate()
        .then(() => reject(new Error("Saving cancelled.")));
    };
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      void worker
        .terminate()
        .then(() => reject(new Error("PDF validation timed out.")));
    }, 120000);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    worker.once("message", (result) => {
      cleanup();
      result.ok ? resolve(result.value) : reject(new Error(result.error));
    });
    worker.once("error", () => {
      cleanup();
      reject(new Error("This PDF couldn't be validated safely."));
    });
    worker.once("exit", (code) => {
      cleanup();
      reject(
        new Error(
          code
            ? "PDF validation stopped."
            : "PDF validation returned no result.",
        ),
      );
    });
  });
}
export async function snapshotSource(
  binary: string,
  file: RegisteredFile,
  directory: string,
  signal?: AbortSignal,
) {
  const bytes = await fs.readFile(file.path);
  if (
    file.hash &&
    createHash("sha256").update(bytes).digest("hex") !== file.hash
  )
    throw new Error(
      "This PDF has changed on disk. Reopen it before rearranging pages.",
    );
  const snapshot = path.join(directory, "source.pdf");
  await fs.writeFile(snapshot, bytes, { flag: "wx" });
  const password =
    file.password !== undefined ? [`--password=${file.password}`] : [];
  const info = JSON.parse(
    await runQpdf(
      binary,
      [...password, "--json", "--json-key=encrypt", snapshot],
      signal,
    ),
  );
  if (info.encrypt.encrypted && !info.encrypt.capabilities.modifyassembly)
    throw new Error(
      "This PDF doesn't allow rearranging pages. Ask the owner for an unrestricted copy.",
    );
  const plain = path.join(directory, "inspection.pdf");
  await runQpdf(
    binary,
    [...password, "--decrypt", "--stream-data=preserve", snapshot, plain],
    signal,
  );
  return { snapshot, plain, password };
}
export async function generateRearranged(
  binary: string,
  source: { snapshot: string; plain: string; password: string[] },
  order: number[],
  destination: string,
  signal?: AbortSignal,
  inspect = inspectJob,
) {
  const before = await inspect(source.plain, signal);
  if (before.blocked) throw new Error(before.blocked);
  validatePermutation(order, before.pageCount);
  // A primary input retains document-level structures; --empty would discard them.
  // Only validated numeric page IDs go into the argument file. Passwords and
  // paths remain individual process arguments, including any embedded newline.
  const argumentFile = path.join(path.dirname(destination), "rearrange.args");
  await fs.writeFile(argumentFile, order.join(",") + "\n", { flag: "wx" });
  const args = [
    ...source.password,
    "--stream-data=preserve",
    "--remove-unreferenced-resources=no",
    source.snapshot,
    "--pages",
    ".",
    `@${argumentFile}`,
    "--",
    destination,
  ];
  // qpdf argument files avoid Windows' command-line length limit on large PDFs.
  await runQpdf(binary, args, signal);
  await runQpdf(binary, [...source.password, "--check", destination], signal);
  const verification = path.join(path.dirname(destination), "verification.pdf");
  await runQpdf(
    binary,
    [
      ...source.password,
      "--decrypt",
      "--stream-data=preserve",
      destination,
      verification,
    ],
    signal,
  );
  const after = await inspect(verification, signal);
  if (
    !(await fs.stat(destination)).size ||
    after.pageCount !== before.pageCount ||
    order.some(
      (original, position) =>
        before.fingerprints[original - 1] !== after.fingerprints[position],
    )
  )
    throw new Error(
      "The saved page order couldn't be verified. No file has been saved.",
    );
  return before;
}
