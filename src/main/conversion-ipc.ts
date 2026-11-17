import { dialog, type BrowserWindow } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { z } from "zod";
import {
  conversionPlanSchema,
  inspectImage,
  MAX_BATCH_BYTES,
  MAX_IMAGE_BYTES,
  type ConversionInput,
  type ConversionImport,
  type ConversionPlan,
  type ConversionResult,
} from "../shared/conversion";
import type { RegisteredFile } from "./pdf-engine";
import { assertNotSource } from "./pdf-engine";
import { trackExport } from "./recovery";
import { safeName } from "../shared/plans";
import { readConversionFile } from "./conversion-files";

type Handle = (
  channel: string,
  callback: (payload: any) => Promise<unknown>,
) => void;
type Input = ConversionInput & { path: string; hash: string };
type Job = {
  id: string;
  plan: ConversionPlan;
  destinations: { path: string; replace: boolean }[];
  staging: string;
  worker: Worker;
  count: number;
  bytes: number;
  outputs: ConversionResult["outputs"];
  cancelled: boolean;
  workerFailed?: boolean;
  pending?: Promise<unknown>;
  cleanup?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
};
export function setupConversionIPC(deps: {
  handle: Handle;
  window: () => BrowserWindow;
  files: Map<string, RegisteredFile>;
  saved: Map<string, string>;
  journal: () => string;
  registerPdf: (
    location: string,
  ) => Promise<{ id: string; name: string; size: number }>;
  locked: () => boolean;
  lock: (value: boolean) => void;
  validatePdf: (id: string, pages: number[]) => Promise<void>;
}) {
  const inputs = new Map<string, Input>();
  let job: Job | undefined;
  function current(id: unknown) {
    if (!job || job.id !== z.string().uuid().parse(id))
      throw new Error("This conversion is no longer active.");
    return job;
  }
  async function read(input: Input) {
    const stat = await fs.stat(input.path);
    if (stat.size !== input.size)
      throw new Error("This file has changed. Please add it again.");
    const bytes = await readConversionFile(input.path, MAX_IMAGE_BYTES);
    if (createHash("sha256").update(bytes).digest("hex") !== input.hash)
      throw new Error("This file has changed. Please add it again.");
    return new Uint8Array(bytes);
  }
  async function importPaths(paths: string[]): Promise<ConversionImport> {
    const result: ConversionImport = { files: [], errors: [] };
    for (const location of paths) {
      try {
        const extension = path.extname(location).toLowerCase();
        if (![".jpg", ".jpeg", ".png", ".pdf"].includes(extension))
          throw new Error("This image format isn't supported.");
        if (extension === ".pdf") {
          const file = await deps.registerPdf(location);
          result.files.push({
            id: file.id,
            name: file.name,
            size: file.size,
            kind: "pdf",
            mimeType: "application/pdf",
          });
          continue;
        }
        const actual = await fs.realpath(location),
          stat = await fs.stat(actual);
        if (!stat.isFile() || !stat.size || stat.size > MAX_IMAGE_BYTES)
          throw new Error(
            "This image exceeds the supported file size or couldn't be opened.",
          );
        // Keep the registry bounded by available memory without retaining full-resolution bitmaps.
        if (
          [...inputs.values()].reduce((sum, input) => sum + input.size, 0) +
            stat.size >
          MAX_BATCH_BYTES
        )
          throw new Error(
            "This batch exceeds 512 MB. Remove some images before adding more.",
          );
        const bytes = await readConversionFile(actual, MAX_IMAGE_BYTES);
        const dims = inspectImage(bytes);
        if ((extension === ".png") !== (dims.mimeType === "image/png"))
          throw new Error("This image's format doesn't match its extension.");
        const id = randomUUID(),
          hash = createHash("sha256").update(bytes).digest("hex");
        const input: Input = {
          id,
          name: path.basename(actual),
          size: stat.size,
          path: actual,
          kind: "image",
          mimeType: dims.mimeType,
          hash,
        };
        inputs.set(id, input);
        deps.files.set(id, { path: actual, hash });
        const { path: _path, hash: _hash, ...metadata } = input;
        result.files.push(metadata);
      } catch (error) {
        result.errors.push(
          `${path.basename(location)}: ${error instanceof Error ? error.message : "Couldn't open this file."}`,
        );
      }
    }
    return result;
  }
  function rpc(active: Job, message: Record<string, unknown>) {
    if (active.workerFailed)
      return Promise.reject(
        new Error(
          "The conversion process stopped. Try fewer images or a lower resolution.",
        ),
      );
    const promise = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        void active.worker.terminate();
        reject(new Error("Conversion timed out. Try a smaller batch."));
      }, 120_000);
      const clean = () => {
        clearTimeout(timer);
        active.worker.off("message", done);
        active.worker.off("error", fail);
        active.worker.off("exit", exit);
      };
      const done = (result: any) => {
        clean();
        result.ok ? resolve(result.value) : reject(new Error(result.error));
      };
      const fail = () => {
        clean();
        reject(new Error("Couldn't process this file."));
      };
      const exit = () => {
        clean();
        reject(
          new Error(
            active.cancelled
              ? "Conversion cancelled."
              : "The conversion process stopped.",
          ),
        );
      };
      active.worker.once("message", done);
      active.worker.once("error", fail);
      active.worker.once("exit", exit);
      active.worker.postMessage(message);
    });
    return promise;
  }
  async function cleanup(active: Job) {
    if (active.cleanup) return active.cleanup;
    active.cleanup = (async () => {
      clearTimeout(active.timer);
      await active.worker.terminate();
      try {
        await fs.rm(active.staging, { recursive: true, force: true });
        await fs.rm(deps.journal(), { force: true });
      } catch {
        /* Owned staging is cleaned on next launch. */
      }
      if (job === active) {
        job = undefined;
        deps.lock(false);
      }
    })();
    return active.cleanup;
  }
  function touch(active: Job) {
    clearTimeout(active.timer);
    active.timer = setTimeout(() => {
      active.cancelled = true;
      void active.worker.terminate().then(async () => {
        await active.pending?.catch(() => {});
        await cleanup(active);
      });
    }, 180_000);
  }
  deps.handle("conversion:pick", async (kind) => {
    z.enum(["image", "pdf"]).parse(kind);
    if (deps.locked()) throw new Error("Another operation is in progress.");
    const result = await dialog.showOpenDialog(deps.window(), {
      title: kind === "image" ? "Select images" : "Select PDF",
      filters: [
        {
          name: kind === "image" ? "Images" : "PDF document",
          extensions: kind === "image" ? ["jpg", "jpeg", "png"] : ["pdf"],
        },
      ],
      properties:
        kind === "image" ? ["openFile", "multiSelections"] : ["openFile"],
    });
    return importPaths(result.canceled ? [] : result.filePaths);
  });
  deps.handle("conversion:import", async (paths) => {
    if (deps.locked()) throw new Error("Another operation is in progress.");
    return importPaths(z.array(z.string().min(1)).min(1).parse(paths));
  });
  deps.handle("conversion:read", async (id) => {
    const key = z.string().uuid().parse(id),
      input = inputs.get(key);
    if (input) return read(input);
    const pdf = deps.files.get(key);
    if (!pdf) throw new Error("Please reopen this file.");
    const stat = await fs.stat(pdf.path);
    if (stat.size > MAX_BATCH_BYTES) throw new Error("This PDF is too large.");
    const bytes = await readConversionFile(pdf.path, MAX_BATCH_BYTES);
    if (
      pdf.hash &&
      createHash("sha256").update(bytes).digest("hex") !== pdf.hash
    )
      throw new Error("This file has changed. Please reopen it.");
    return new Uint8Array(bytes);
  });
  deps.handle("conversion:release", async (ids) => {
    const values = z.array(z.string().uuid()).parse(ids);
    if (job) throw new Error("Wait for the conversion to finish.");
    for (const id of values) inputs.delete(id);
  });
  deps.handle("conversion:begin", async (payload) => {
    if (deps.locked()) throw new Error("Another operation is in progress.");
    const plan = conversionPlanSchema.parse(payload);
    if (os.freemem() < 256 * 1024 * 1024)
      throw new Error(
        "Not enough available memory. Close other applications and try again.",
      );
    if (
      plan.type === "image-to-pdf" &&
      plan.imageIds.some((id) => !inputs.has(id))
    )
      throw new Error("Please add your images again.");
    if (plan.type === "pdf-to-image" && !deps.files.has(plan.sourceId))
      throw new Error("Please reopen the PDF.");
    deps.lock(true);
    let staging: string | undefined;
    try {
      if (plan.type === "pdf-to-image")
        await deps.validatePdf(plan.sourceId, plan.pages);
      const pages =
        plan.type === "pdf-to-image"
          ? [...new Set(plan.pages)].sort((a, b) => a - b)
          : [];
      if (plan.type === "pdf-to-image") plan.pages = pages;
      const base =
        plan.type === "image-to-pdf"
          ? safeName(
              inputs.get(plan.imageIds[0])!.name.replace(/\.(jpe?g|png)$/i, ""),
            )
          : safeName(path.basename(deps.files.get(plan.sourceId)!.path));
      const extension =
        plan.type === "image-to-pdf"
          ? "pdf"
          : plan.format === "jpeg"
            ? "jpg"
            : "png";
      const names =
        plan.type === "image-to-pdf"
          ? [`${base || "images_combined"}.pdf`]
          : pages.map(
              (page) =>
                `${base}_page_${String(page).padStart(Math.max(3, String(pages.at(-1)).length), "0")}.${extension}`,
            );
      let paths: string[];
      if (names.length === 1) {
        const selected = await dialog.showSaveDialog(deps.window(), {
          title: "Save converted file",
          defaultPath: names[0],
          filters: [
            {
              name: extension.toUpperCase(),
              extensions: extension === "jpg" ? ["jpg", "jpeg"] : [extension],
            },
          ],
          properties: ["showOverwriteConfirmation"],
        });
        if (selected.canceled || !selected.filePath) {
          deps.lock(false);
          return null;
        }
        paths = [
          (
            extension === "jpg"
              ? /\.jpe?g$/i.test(selected.filePath)
              : selected.filePath.toLowerCase().endsWith(`.${extension}`)
          )
            ? selected.filePath
            : `${selected.filePath}.${extension}`,
        ];
      } else {
        const selected = await dialog.showOpenDialog(deps.window(), {
          title: "Choose output folder",
          properties: ["openDirectory", "createDirectory"],
        });
        if (selected.canceled || !selected.filePaths[0]) {
          deps.lock(false);
          return null;
        }
        paths = names.map((name) => path.join(selected.filePaths[0], name));
      }
      const destinations: Job["destinations"] = [];
      for (let destination of paths) {
        await assertNotSource(destination, deps.files);
        let replace = false;
        if (
          await fs.lstat(destination).then(
            () => true,
            () => false,
          )
        ) {
          const answer = await dialog.showMessageBox(deps.window(), {
            type: "question",
            title: "File already exists",
            message: `${path.basename(destination)} already exists.`,
            buttons: ["Keep Both", "Replace", "Cancel"],
            defaultId: 0,
            cancelId: 2,
          });
          if (answer.response === 2) {
            deps.lock(false);
            return null;
          }
          replace = answer.response === 1;
          if (!replace) {
            const ext = path.extname(destination),
              stem = destination.slice(0, -ext.length);
            let suffix = 1;
            do {
              destination = `${stem} (${suffix++})${ext}`;
            } while (
              await fs.lstat(destination).then(
                () => true,
                () => false,
              )
            );
          }
        }
        destinations.push({ path: destination, replace });
      }
      staging = await fs.mkdtemp(
        path.join(path.dirname(paths[0]), ".paperin-export-"),
      );
      await trackExport(deps.journal(), staging);
      const active: Job = {
        id: randomUUID(),
        plan,
        destinations,
        staging,
        worker: new Worker(path.join(__dirname, "conversion-worker.js"), {
          resourceLimits: { maxOldGenerationSizeMb: 1024 },
        }),
        count: 0,
        bytes: 0,
        outputs: [],
        cancelled: false,
      };
      job = active;
      // A permanent error listener prevents unhandled worker errors between requests.
      active.worker.on("error", () => {
        active.workerFailed = true;
      });
      await rpc(active, { action: "start" });
      touch(active);
      return {
        id: active.id,
        total:
          plan.type === "image-to-pdf" ? plan.imageIds.length : pages.length,
      };
    } catch (error) {
      if (job) await cleanup(job);
      else {
        deps.lock(false);
        if (staging) await fs.rm(staging, { recursive: true, force: true });
      }
      throw error;
    }
  });
  async function commit(active: Job, bytes: Uint8Array, index: number) {
    if (active.cancelled) throw new Error("Conversion cancelled.");
    const temporary = path.join(active.staging, `${index}.output`);
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    const destination = active.destinations[index];
    await assertNotSource(destination.path, deps.files);
    if (active.cancelled) throw new Error("Conversion cancelled.");
    // Hard linking a new file is atomic and refuses collisions that appear after the dialog.
    if (destination.replace) await fs.rename(temporary, destination.path);
    else {
      await fs.link(temporary, destination.path);
      await fs.unlink(temporary);
    }
    const id = randomUUID();
    deps.saved.set(id, destination.path);
    active.outputs.push({ id, name: path.basename(destination.path) });
  }
  deps.handle("conversion:append", async (payload) => {
    const { id, bytes } = z
      .object({
        id: z.string().uuid(),
        bytes: z
          .instanceof(Uint8Array)
          .refine((v) => v.length > 0 && v.length <= MAX_IMAGE_BYTES),
      })
      .strict()
      .parse(payload);
    const active = current(id);
    if (active.cancelled) throw new Error("Conversion cancelled.");
    if (active.pending) throw new Error("Wait for the current page to finish.");
    const total =
      active.plan.type === "image-to-pdf"
        ? active.plan.imageIds.length
        : active.plan.pages.length;
    if (active.count >= total)
      throw new Error("All pages have already been processed.");
    const work = async () => {
      if (os.freemem() < 256 * 1024 * 1024)
        throw new Error(
          "Not enough available memory. Try fewer images or a lower resolution.",
        );
      const dims = inspectImage(bytes);
      if (active.plan.type === "image-to-pdf") {
        active.bytes += bytes.length;
        if (active.bytes > MAX_BATCH_BYTES)
          throw new Error(
            "This export exceeds the supported memory limit. Try fewer images.",
          );
        await rpc(active, {
          action: "image",
          bytes,
          options: active.plan.options,
        });
      } else {
        await rpc(active, {
          action: "validate",
          bytes,
          mimeType: `image/${active.plan.format}`,
        });
        if (!dims.width || !dims.height)
          throw new Error("Couldn't validate the converted file.");
        await commit(active, bytes, active.count);
      }
      if (active.cancelled) throw new Error("Conversion cancelled.");
      active.count++;
      touch(active);
      return active.count;
    };
    active.pending = work();
    try {
      return await active.pending;
    } finally {
      active.pending = undefined;
    }
  });
  deps.handle("conversion:finish", async (id) => {
    const active = current(id);
    if (active.pending) throw new Error("Wait for the current page to finish.");
    const total =
      active.plan.type === "image-to-pdf"
        ? active.plan.imageIds.length
        : active.plan.pages.length;
    try {
      if (active.cancelled || active.count !== total)
        throw new Error("The conversion is incomplete.");
      active.pending = (async () => {
        if (active.plan.type === "image-to-pdf") {
          const bytes = await rpc(active, { action: "finish", count: total });
          await commit(active, bytes, 0);
        }
      })();
      await active.pending;
      return {
        status: "completed",
        outputs: active.outputs,
      } satisfies ConversionResult;
    } catch (error) {
      return {
        status: active.cancelled ? "cancelled" : "failed",
        outputs: active.outputs,
        error: active.cancelled
          ? "Conversion cancelled."
          : (error as NodeJS.ErrnoException).code === "ENOSPC"
            ? "Not enough disk space."
            : ["EACCES", "EPERM"].includes(
                  (error as NodeJS.ErrnoException).code ?? "",
                )
              ? "Couldn't save the converted file. Choose another folder."
              : error instanceof Error
                ? error.message
                : "Couldn't save the converted file.",
      } satisfies ConversionResult;
    } finally {
      active.pending = undefined;
      await cleanup(active);
    }
  });
  deps.handle("conversion:abort", async (payload) => {
    const { id, failed } = z
      .object({ id: z.string().uuid(), failed: z.boolean() })
      .strict()
      .parse(payload);
    const active = current(id);
    active.cancelled = true;
    await active.worker.terminate();
    await active.pending?.catch(() => {});
    await cleanup(active);
    return {
      status: failed ? "failed" : "cancelled",
      outputs: active.outputs,
    } satisfies ConversionResult;
  });
}
