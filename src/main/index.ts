import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
} from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import squirrelStartup from "electron-squirrel-startup";
import {
  assertNotSource,
  generateOutput,
  validatePlan,
  planSchema,
  runQpdf,
  type RegisteredFile,
} from "./pdf-engine";
import { recoverExports, trackExport } from "./recovery";
import type { LocalFile, Result, SavedFile } from "../shared/types";
import {
  MAX_PNG_BYTES,
  MAX_SESSION_IMAGES,
  signatureExportSchema,
  type SignatureImage,
} from "../shared/signature";
import { signatureJob } from "./pdf-engine/signature/signature-service";

app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "folio",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
const files = new Map<string, RegisteredFile>();
const saved = new Map<string, string>();
type SignatureSession = {
  documentId: string;
  bytes: Uint8Array;
  pageCount: number;
  images: Map<string, SignatureImage>;
};
const signatureSessions = new Map<string, SignatureSession>();
let signatureWorking = false;
function signatureSession(id: unknown) {
  const session = signatureSessions.get(z.string().uuid().parse(id));
  if (!session) throw new Error("Please reopen the signature editor.");
  return session;
}
let mainWindow: BrowserWindow;
let exporting = false;
const rendererRoot = path.resolve(__dirname, "../renderer");
const resourceRoot = () =>
  app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), "resources");
const qpdf = () =>
  path.join(
    resourceRoot(),
    app.isPackaged ? "qpdf" : "binaries/qpdf",
    "bin",
    process.platform === "win32" ? "qpdf.exe" : "qpdf",
  );
const journal = () =>
  path.join(app.getPath("userData"), "export-recovery.json");

async function register(filePath: string): Promise<LocalFile> {
  if (path.extname(filePath).toLowerCase() !== ".pdf")
    throw new Error("Choose a PDF file (.pdf) to continue.");
  const actualPath = await fs.realpath(filePath);
  const stat = await fs.stat(actualPath);
  if (!stat.isFile())
    throw new Error("Choose a PDF file, rather than a folder.");
  if (stat.size > 512 * 1024 * 1024)
    throw new Error(
      "This PDF exceeds the current 512 MB limit. Try a smaller document.",
    );
  const bytes = await fs.readFile(actualPath);
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
    throw new Error(
      "This PDF couldn't be opened. The file may be damaged or have the wrong format.",
    );
  const id = randomUUID();
  files.set(id, {
    path: actualPath,
    hash: createHash("sha256").update(bytes).digest("hex"),
  });
  return {
    id,
    name: path.basename(actualPath),
    size: stat.size,
    bytes: new Uint8Array(bytes),
  };
}
function isTrusted(event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) {
  if (
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  )
    return false;
  const url = new URL(event.senderFrame.url);
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
    return url.origin === new URL(process.env.ELECTRON_RENDERER_URL).origin;
  return url.protocol === "folio:" && url.host === "app";
}
function handle(channel: string, callback: (payload: any) => Promise<unknown>) {
  ipcMain.handle(channel, async (event, payload): Promise<Result<unknown>> => {
    if (!isTrusted(event))
      return { ok: false, error: "This request is not allowed." };
    try {
      return { ok: true, value: await callback(payload) };
    } catch (error: any) {
      const message =
        error instanceof z.ZodError
          ? "The operation contains invalid settings. Review your page selection."
          : error.code === "ENOSPC"
            ? "Not enough disk space. Free some space and try again."
            : ["EACCES", "EPERM"].includes(error.code)
              ? "This location is not writable. Choose another folder."
              : error.code === "ENOENT"
                ? "The file is no longer available. Please choose it again."
                : error.message || "Something went wrong. Please try again.";
      return { ok: false, error: message };
    }
  });
}
function setupIPC() {
  handle("signature:begin", async (id) => {
    if (signatureWorking || exporting)
      throw new Error("Another operation is in progress. Please wait.");
    signatureWorking = true;
    try {
      const documentId = z.string().uuid().parse(id);
      const file = files.get(documentId);
      if (!file) throw new Error("Please reopen the document.");
      const bytes = await fs.readFile(file.path);
      if (
        file.hash &&
        createHash("sha256").update(bytes).digest("hex") !== file.hash
      )
        throw new Error(
          "This PDF has changed on disk. Reopen it before adding a signature.",
        );
      const pageCount = await signatureJob<number>({
        action: "inspect",
        bytes,
      });
      signatureSessions.clear();
      const sessionId = randomUUID();
      signatureSessions.set(sessionId, {
        documentId,
        bytes,
        pageCount,
        images: new Map(),
      });
      return sessionId;
    } finally {
      signatureWorking = false;
    }
  });
  handle("signature:pick", async (id) => {
    if (signatureWorking || exporting)
      throw new Error("Another operation is in progress. Please wait.");
    const session = signatureSession(id);
    signatureWorking = true;
    try {
      if (session.images.size >= MAX_SESSION_IMAGES)
        throw new Error(
          "This session supports up to 8 images. Cancel the editor to start a new session.",
        );
      const result = await dialog.showOpenDialog(mainWindow, {
        title: "Choose a signature PNG",
        filters: [{ name: "PNG image", extensions: ["png"] }],
        properties: ["openFile"],
      });
      if (result.canceled || !result.filePaths[0]) return null;
      const location = result.filePaths[0];
      const file = await fs.open(location, "r");
      let bytes: Buffer;
      try {
        const stat = await file.stat();
        if (!stat.isFile()) throw new Error("Please choose a PNG image.");
        if (stat.size > MAX_PNG_BYTES)
          throw new Error("This image exceeds the supported size.");
        // Bounded read also handles a file that grows after stat().
        const buffer = Buffer.alloc(MAX_PNG_BYTES + 1);
        let used = 0;
        while (used < buffer.length) {
          const { bytesRead } = await file.read(
            buffer,
            used,
            buffer.length - used,
            null,
          );
          if (!bytesRead) break;
          used += bytesRead;
        }
        if (used > MAX_PNG_BYTES)
          throw new Error("This image exceeds the supported size.");
        bytes = buffer.subarray(0, used);
      } finally {
        await file.close();
      }
      const name = path.basename(location);
      const dims = await signatureJob<{ widthPx: number; heightPx: number }>({
        action: "image",
        name,
        bytes,
      });
      if (
        [...session.images.values()].reduce(
          (n, i) => n + i.widthPx * i.heightPx,
          0,
        ) +
          dims.widthPx * dims.heightPx >
        32_000_000
      )
        throw new Error(
          "This session exceeds the supported image size. Cancel the editor to start a new session.",
        );
      const image: SignatureImage = {
        id: randomUUID(),
        name,
        mimeType: "image/png",
        ...dims,
        bytes: new Uint8Array(bytes),
      };
      session.images.set(image.id, image);
      return image;
    } finally {
      signatureWorking = false;
    }
  });
  handle("signature:end", async (id) => {
    z.string().uuid().parse(id);
    if (signatureWorking || exporting)
      throw new Error("Another operation is in progress. Please wait.");
    signatureSessions.delete(id);
  });
  handle("signature:export", async (payload) => {
    if (signatureWorking || exporting)
      throw new Error("Another export is in progress. Please wait.");
    const plan = signatureExportSchema.parse(payload);
    const session = signatureSession(plan.sessionId);
    exporting = true;
    let staging: string | undefined;
    try {
      const source = files.get(session.documentId)!;
      const result = await dialog.showSaveDialog(mainWindow, {
        title: "Save signed PDF as",
        defaultPath: `${path.basename(source.path, path.extname(source.path))}_signed.pdf`,
        filters: [{ name: "PDF document", extensions: ["pdf"] }],
        properties: ["showOverwriteConfirmation"],
      });
      if (result.canceled || !result.filePath) return null;
      const destination = result.filePath.toLowerCase().endsWith(".pdf")
        ? result.filePath
        : `${result.filePath}.pdf`;
      await assertNotSource(destination, files);
      mainWindow.webContents.send("pdf:progress", "Adding your signatures…");
      const output = await signatureJob<Uint8Array>({
        action: "export",
        bytes: session.bytes,
        placements: plan.placements,
        images: [...session.images.values()],
      });
      staging = await fs.mkdtemp(
        path.join(path.dirname(destination), ".folio-export-"),
      );
      await trackExport(journal(), staging);
      const temporary = path.join(staging, "signed.pdf");
      await fs.writeFile(temporary, output, { flag: "wx" });
      mainWindow.webContents.send("pdf:progress", "Checking the signed PDF…");
      await runQpdf(qpdf(), ["--check", temporary]);
      if (
        Number((await runQpdf(qpdf(), ["--show-npages", temporary])).trim()) !==
        session.pageCount
      )
        throw new Error("Couldn't save the signed PDF.");
      await assertNotSource(destination, files);
      await fs.rename(temporary, destination);
      const id = randomUUID();
      saved.set(id, destination);
      return { id, name: path.basename(destination) };
    } finally {
      exporting = false;
      if (!mainWindow.isDestroyed())
        mainWindow.webContents.send("pdf:progress", null);
      if (staging) {
        try {
          await fs.rm(staging, { recursive: true, force: true });
          await fs.rm(journal(), { force: true });
        } catch {
          /* Startup recovery retries owned staging cleanup. */
        }
      }
    }
  });
  handle("files:pick", async (multiple) => {
    z.boolean().parse(multiple);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Open PDF documents",
      filters: [{ name: "PDF documents", extensions: ["pdf"] }],
      properties: [
        "openFile",
        ...(multiple ? ["multiSelections" as const] : []),
      ],
    });
    return result.canceled ? [] : Promise.all(result.filePaths.map(register));
  });
  handle("files:import", async (paths) => {
    z.array(z.string().min(1)).min(1).max(100).parse(paths);
    return Promise.all(paths.map(register));
  });
  handle("files:sample", async () => [
    await register(
      path.join(resourceRoot(), "samples", "A little room to think.pdf"),
    ),
  ]);
  handle("files:password", async (payload) => {
    const { id, password } = z
      .object({ id: z.string().uuid(), password: z.string().max(1024) })
      .strict()
      .parse(payload);
    const file = files.get(id);
    if (!file) throw new Error("Please reopen the document.");
    file.password = password;
  });
  handle("pdf:export", async (payload) => {
    if (exporting || signatureWorking)
      throw new Error("Another export is in progress. Please wait.");
    exporting = true;
    let staging: string | undefined;
    let committed = 0;
    try {
      const plan = planSchema.parse(payload);
      mainWindow.webContents.send("pdf:progress", "Checking your documents…");
      await validatePlan(qpdf(), plan, files);
      let destinations: string[];
      if (plan.outputs.length === 1) {
        const result = await dialog.showSaveDialog(mainWindow, {
          title: "Save your PDF",
          defaultPath: plan.outputs[0].name,
          filters: [{ name: "PDF document", extensions: ["pdf"] }],
          properties: ["showOverwriteConfirmation"],
        });
        if (result.canceled || !result.filePath) return null;
        destinations = [
          result.filePath.toLowerCase().endsWith(".pdf")
            ? result.filePath
            : `${result.filePath}.pdf`,
        ];
      } else {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: "Choose a folder for your PDFs",
          properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled) return null;
        destinations = plan.outputs.map((o) =>
          path.join(result.filePaths[0], o.name),
        );
        const existing: string[] = [];
        for (const dest of destinations) {
          try {
            await fs.access(dest);
            existing.push(path.basename(dest));
          } catch {
            /* New file. */
          }
        }
        if (existing.length) {
          const answer = await dialog.showMessageBox(mainWindow, {
            type: "warning",
            title: "Replace existing PDFs?",
            message: `${existing.length} file(s) already exist in this folder.`,
            detail: existing.join("\n"),
            buttons: ["Cancel", "Replace files"],
            defaultId: 0,
            cancelId: 0,
          });
          if (answer.response !== 1) return null;
        }
      }
      for (const destination of destinations)
        await assertNotSource(destination, files);
      staging = await fs.mkdtemp(
        path.join(path.dirname(destinations[0]), ".folio-export-"),
      );
      await trackExport(journal(), staging);
      for (let i = 0; i < plan.outputs.length; i++) {
        mainWindow.webContents.send(
          "pdf:progress",
          `Preparing PDF ${i + 1} of ${plan.outputs.length}…`,
        );
        await generateOutput(
          qpdf(),
          plan.outputs[i],
          files,
          path.join(staging, `${i}.pdf`),
        );
      }
      const result: SavedFile[] = [];
      for (let i = 0; i < destinations.length; i++) {
        await assertNotSource(destinations[i], files);
        await fs.rename(path.join(staging, `${i}.pdf`), destinations[i]);
        committed++;
        const id = randomUUID();
        saved.set(id, destinations[i]);
        result.push({ id, name: path.basename(destinations[i]) });
      }
      return result;
    } catch (error: any) {
      if (committed)
        throw new Error(
          `${committed} PDF(s) were saved before an error occurred. Check the destination folder before trying again.`,
        );
      throw error;
    } finally {
      exporting = false;
      if (!mainWindow.isDestroyed())
        mainWindow.webContents.send("pdf:progress", null);
      if (staging) {
        try {
          await fs.rm(staging, { recursive: true, force: true });
          await fs.rm(journal(), { force: true });
        } catch {
          /* Startup recovery retries staging cleanup. */
        }
      }
    }
  });
  handle("saved:open", async (id) => {
    const destination = saved.get(z.string().uuid().parse(id));
    if (!destination) throw new Error("This export is no longer available.");
    return [await register(destination)];
  });
  handle("saved:show", async (id) => {
    const destination = saved.get(z.string().uuid().parse(id));
    if (!destination) throw new Error("This export is no longer available.");
    shell.showItemInFolder(destination);
  });
  ipcMain.on("window:action", (event, action) => {
    if (!isTrusted(event)) return;
    if (action === "minimize") mainWindow.minimize();
    if (action === "maximize")
      mainWindow.isMaximized()
        ? mainWindow.unmaximize()
        : mainWindow.maximize();
    if (action === "close") mainWindow.close();
  });
}
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    frame: false,
    backgroundColor: "#f8f9fc",
    title: "Folio",
    show: false,
    icon: path.join(resourceRoot(), "icons/folio.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    const answer = dialog.showMessageBoxSync(mainWindow, {
      type: "question",
      title: "Close Folio?",
      message: "You have changes that have not been exported.",
      detail:
        "Your original documents are safe. Close without saving the current setup?",
      buttons: ["Keep working", "Close Folio"],
      defaultId: 0,
      cancelId: 0,
    });
    if (answer === 1) event.preventDefault();
  });
  mainWindow.on("close", (event) => {
    if (exporting) {
      event.preventDefault();
      return;
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL)
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await mainWindow.loadURL("folio://app/index.html");
}
app.whenReady().then(async () => {
  if (squirrelStartup) return;
  protocol.handle("folio", (request) => {
    const url = new URL(request.url);
    const file = path.resolve(
      rendererRoot,
      "." + decodeURIComponent(url.pathname),
    );
    if (url.host !== "app" || !file.startsWith(rendererRoot + path.sep))
      return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).href);
  });
  session.defaultSession.setPermissionRequestHandler(
    (_wc, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = new URL(details.url);
    const dev =
      !app.isPackaged &&
      process.env.ELECTRON_RENDERER_URL &&
      ["localhost", "127.0.0.1"].includes(url.hostname);
    callback({
      cancel:
        !dev &&
        !["folio:", "file:", "blob:", "data:", "devtools:"].includes(
          url.protocol,
        ),
    });
  });
  setupIPC();
  await recoverExports(journal());
  await createWindow();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) void createWindow();
  });
});
app.on("window-all-closed", () => app.quit());
