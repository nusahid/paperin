import { dialog, type BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { rearrangeSchema } from "../shared/rearrange";
import { assertNotSource, type RegisteredFile } from "./pdf-engine";
import {
  generateRearranged,
  inspectJob,
  snapshotSource,
} from "./pdf-engine/rearrange/service";
import { trackExport } from "./recovery";

async function destinationState(location: string) {
  try {
    const stat = await fs.lstat(location);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new Error("Choose a regular PDF output file.");
    return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`;
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function setupRearrangeIPC(context: {
  handle: (
    channel: string,
    callback: (payload: any) => Promise<unknown>,
  ) => void;
  window: () => BrowserWindow;
  files: Map<string, RegisteredFile>;
  saved: Map<string, string>;
  binary: () => string;
  journal: () => string;
  temp: () => string;
  locked: () => boolean;
  lock: (value: boolean) => void;
}) {
  let controller: AbortController | null = null;
  const progress = (message: string | null) => {
    if (!context.window().isDestroyed())
      context.window().webContents.send("pdf:progress", message);
  };
  async function cleanup(directory?: string) {
    if (
      directory &&
      path.basename(directory).startsWith(".paperin-export-") &&
      path.isAbsolute(directory)
    ) {
      try {
        await fs.rm(directory, { recursive: true, force: true });
        await fs.rm(context.journal(), { force: true });
      } catch {
        /* Startup recovery retries owned staging cleanup. */
      }
    }
  }
  context.handle("rearrange:cancel", async () => {
    controller?.abort();
  });
  context.handle("rearrange:inspect", async (payload) => {
    if (context.locked())
      throw new Error("Another operation is in progress. Please wait.");
    const file = context.files.get(z.string().uuid().parse(payload));
    if (!file) throw new Error("Please reopen the document.");
    context.lock(true);
    let staging: string | undefined;
    try {
      staging = await fs.mkdtemp(path.join(context.temp(), ".paperin-export-"));
      await trackExport(context.journal(), staging);
      const source = await snapshotSource(context.binary(), file, staging);
      const { fingerprints: _, ...inspection } = await inspectJob(source.plain);
      return inspection;
    } finally {
      await cleanup(staging);
      context.lock(false);
    }
  });
  context.handle("rearrange:export", async (payload) => {
    if (context.locked())
      throw new Error("Another operation is in progress. Please wait.");
    const plan = rearrangeSchema.parse(payload);
    const file = context.files.get(plan.documentId);
    if (!file) throw new Error("Please reopen the document.");
    context.lock(true);
    controller = new AbortController();
    const signal = controller.signal;
    let staging: string | undefined;
    try {
      const result = await dialog.showSaveDialog(context.window(), {
        title: "Save reordered PDF as",
        defaultPath: `${path.basename(file.path, path.extname(file.path))}_reordered.pdf`,
        filters: [{ name: "PDF document", extensions: ["pdf"] }],
        properties: ["showOverwriteConfirmation"],
      });
      if (result.canceled || !result.filePath || signal.aborted) return null;
      let destination = result.filePath.toLowerCase().endsWith(".pdf")
        ? result.filePath
        : `${result.filePath}.pdf`;
      await assertNotSource(destination, context.files);
      let existing = await destinationState(destination);
      if (existing !== null) {
        const choice = await dialog.showMessageBox(context.window(), {
          type: "question",
          title: "A file with this name already exists",
          message: `How would you like to save ${path.basename(destination)}?`,
          buttons: ["Keep Both", "Replace", "Cancel"],
          defaultId: 0,
          cancelId: 2,
          noLink: true,
        });
        if (choice.response === 2 || signal.aborted) return null;
        if (choice.response === 0) {
          const base = destination.slice(0, -4);
          let suffix = 2;
          do {
            destination = `${base} (${suffix++}).pdf`;
          } while ((await destinationState(destination)) !== null);
          existing = null;
        }
      }
      progress("Checking your PDF…");
      staging = await fs.mkdtemp(
        path.join(path.dirname(destination), ".paperin-export-"),
      );
      await trackExport(context.journal(), staging);
      const source = await snapshotSource(
        context.binary(),
        file,
        staging,
        signal,
      );
      progress("Reordering and verifying every page…");
      const temporary = path.join(staging, "reordered.pdf");
      await generateRearranged(
        context.binary(),
        source,
        plan.order,
        temporary,
        signal,
      );
      signal.throwIfAborted();
      await assertNotSource(destination, context.files);
      if ((await destinationState(destination)) !== existing)
        throw new Error(
          "The destination changed while saving. Choose another filename and try again.",
        );
      // Same-volume rename publishes only a completely validated file.
      await fs.rename(temporary, destination);
      const id = randomUUID();
      context.saved.set(id, destination);
      return { id, name: path.basename(destination) };
    } catch (error) {
      if (signal.aborted) return null;
      throw error;
    } finally {
      await cleanup(staging);
      controller = null;
      context.lock(false);
      progress(null);
    }
  });
}
