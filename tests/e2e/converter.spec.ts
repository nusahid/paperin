import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import { PNG } from "pngjs";
import { createCanvas } from "@napi-rs/canvas";
test.describe.configure({ mode: "serial" });

let app: ElectronApplication,
  page: Page,
  temp: string,
  png: string,
  jpeg: string,
  exif: string,
  pdf: string;
const errors: string[] = [],
  network: string[] = [],
  originals = new Map<string, string>();
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
async function choose(paths: string[]) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: paths,
    })) as any;
  }, paths);
}
async function save(location: string) {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath,
    })) as any;
  }, location);
}
async function back() {
  await page.getByRole("button", { name: "Back to conversion tools" }).click();
}
async function dismiss() {
  const button = page.getByRole("button", {
    name: "Dismiss conversion result",
  });
  if (await button.isVisible()) await button.click();
}
async function pdfMode() {
  if (
    await page
      .getByRole("button", { name: "Back to conversion tools" })
      .isVisible()
  )
    await back();
  await choose([pdf]);
  await page.getByRole("button", { name: /PDF to Image Save PDF/ }).click();
  await expect(page.getByText("3 of 3 pages selected")).toBeVisible();
}
test.beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "paperin-convert-"));
  png = path.join(temp, "Transparent.png");
  jpeg = path.join(temp, "Landscape.jpg");
  exif = path.join(temp, "Phone.jpg");
  pdf = path.join(temp, "Source.pdf");
  const canvas = createCanvas(120, 80),
    ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e92727";
  ctx.fillRect(0, 0, 60, 80);
  await fs.writeFile(png, canvas.toBuffer("image/png"));
  ctx.fillStyle = "#235ce8";
  ctx.fillRect(60, 0, 60, 80);
  const jpg = canvas.toBuffer("image/jpeg");
  await fs.writeFile(jpeg, jpg);
  // TIFF IFD with EXIF orientation 6 (90° clockwise), injected without changing JPEG pixels.
  const metadata = Buffer.from([
    0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 42, 0, 8, 0, 0,
    0, 1, 0, 0x12, 1, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
  ]);
  await fs.writeFile(
    exif,
    Buffer.concat([jpg.subarray(0, 2), metadata, jpg.subarray(2)]),
  );
  const document = await PDFDocument.create();
  for (let i = 0; i < 3; i++) {
    const p = document.addPage([144, 72]);
    p.drawRectangle({ x: 0, y: 0, width: 72, height: 72, color: rgb(1, 0, 0) });
    if (i !== 2)
      p.drawRectangle({
        x: 72,
        y: 0,
        width: 72,
        height: 72,
        color: rgb(0, 0, 1),
      });
    if (i === 1) p.setRotation(degrees(90));
    if (i === 2) p.setCropBox(36, 0, 108, 72);
  }
  await fs.writeFile(pdf, await document.save());
  for (const location of [png, jpeg, exif, pdf])
    originals.set(location, hash(await fs.readFile(location)));
  app = await electron.launch({ args: [path.resolve(".")] });
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) network.push(request.url());
  });
  await page.waitForLoadState("domcontentloaded");
  await app.evaluate(({ session }) =>
    session.defaultSession.enableNetworkEmulation({ offline: true }),
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Convert", exact: true })
    .click();
});
test.afterAll(async () => {
  if (app) {
    await page.evaluate(() => {
      window.onbeforeunload = null;
    });
    await app.evaluate(({ app }) => app.exit());
  }
  if (temp && path.basename(temp).startsWith("paperin-convert-"))
    await fs.rm(temp, { recursive: true, force: true });
});
test("imports mixed images, corrects EXIF, reorders, rotates, previews and creates a PDF offline", async () => {
  await expect(
    page.getByRole("heading", { name: "Convert files." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/convert-home.png" });
  await choose([png, jpeg, exif]);
  await page
    .getByRole("button", { name: /Image to PDF Combine images/ })
    .click();
  await expect(page.locator(".convert-image-card")).toHaveCount(3);
  await expect(page.locator(".convert-image-card").nth(2)).toContainText(
    "80 × 120",
  );
  await page.getByRole("button", { name: "Move Landscape.jpg up" }).click();
  await expect(page.locator(".convert-image-card").first()).toContainText(
    "Landscape.jpg",
  );
  await page
    .getByRole("button", { name: "Rotate Landscape.jpg right" })
    .click();
  await expect(page.locator(".convert-image-card").first()).toContainText(
    "80 × 120",
  );
  await page.getByLabel("Image fit", { exact: true }).selectOption("cover");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("Page 1 of 3 · First page")).toBeVisible();
  await page.getByRole("button", { name: "Next preview page" }).click();
  await page.getByRole("button", { name: "Next preview page" }).click();
  await expect(page.getByText("Page 3 of 3 · Last page")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.screenshot({
    path: "test-results/screenshots/convert-images.png",
  });
  const destination = path.join(temp, "Combined.pdf");
  await save(destination);
  await page.getByRole("button", { name: "Create PDF", exact: true }).click();
  await expect(page.getByText("Conversion completed.")).toBeVisible();
  const output = await PDFDocument.load(await fs.readFile(destination));
  expect(output.getPageCount()).toBe(3);
  expect(output.getPage(0).getHeight()).toBeGreaterThan(
    output.getPage(0).getWidth(),
  );
  expect(output.getPage(1).getWidth()).toBeGreaterThan(
    output.getPage(1).getHeight(),
  );
  await dismiss();
});
test("exports sorted, deduplicated ranges and honours PDF rotation and output DPI", async () => {
  await pdfMode();
  await page.getByLabel("Output format", { exact: true }).selectOption("png");
  await expect(page.getByLabel("JPEG quality", { exact: true })).toHaveCount(0);
  await page.getByLabel("Pages", { exact: true }).selectOption("range");
  await page.getByLabel("Page range", { exact: true }).fill("3, 1-2, 1");
  await expect(page.getByText("3 of 3 pages selected")).toBeVisible();
  await page.getByLabel("Resolution", { exact: true }).selectOption("150");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByText("300 × 150 px · 150 DPI · PNG")).toBeVisible();
  await page.getByRole("button", { name: "Next preview page" }).click();
  await expect(page.getByText("150 × 300 px · 150 DPI · PNG")).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.screenshot({ path: "test-results/screenshots/convert-pdf.png" });
  await choose([temp]);
  await page
    .getByRole("button", { name: "Convert", exact: true })
    .last()
    .click();
  await expect(page.getByText("Conversion completed.")).toBeVisible();
  const first = PNG.sync.read(
    await fs.readFile(path.join(temp, "Source_page_001.png")),
  );
  const second = PNG.sync.read(
    await fs.readFile(path.join(temp, "Source_page_002.png")),
  );
  expect([first.width, first.height]).toEqual([300, 150]);
  expect([second.width, second.height]).toEqual([150, 300]);
  expect(first.data[(75 * 300 + 50) * 4]).toBe(255);
  expect(first.data[(75 * 300 + 250) * 4 + 2]).toBe(255);
  const third = PNG.sync.read(
    await fs.readFile(path.join(temp, "Source_page_003.png")),
  );
  expect([third.width, third.height]).toEqual([225, 150]);
  expect([
    ...third.data.subarray((75 * 225 + 200) * 4, (75 * 225 + 200) * 4 + 4),
  ]).toEqual([255, 255, 255, 255]);
  await dismiss();
});
test("guards invalid ranges, saves a single JPG, and keeps both colliding files", async () => {
  await page.getByLabel("Page range", { exact: true }).fill("1-4");
  await expect(page.getByText(/Choose pages between 1 and 3/)).toBeVisible();
  await expect(page.locator(".convert-export button")).toBeDisabled();
  await page.getByLabel("Pages", { exact: true }).selectOption("current");
  await page.getByLabel("Output format", { exact: true }).selectOption("jpeg");
  await page.getByLabel("JPEG quality", { exact: true }).selectOption("0.6");
  const target = path.join(temp, "single.jpg");
  await save(target);
  await page.locator(".convert-export button").click();
  await expect(page.getByText("Conversion completed.")).toBeVisible();
  const original = await fs.readFile(target);
  expect([...original.subarray(0, 2)]).toEqual([255, 216]);
  await dismiss();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({
      response: 0,
      checkboxChecked: false,
    })) as any;
  });
  await page.locator(".convert-export button").click();
  await expect(page.getByText("Conversion completed.")).toBeVisible();
  expect(await fs.readFile(target)).toEqual(original);
  expect(
    (await fs.stat(path.join(temp, "single (1).jpg"))).size,
  ).toBeGreaterThan(0);
  await dismiss();
});
test("rejects fake/corrupt images, prevents source replacement, cancels jobs and preserves partial exports", async () => {
  await back();
  const fake = path.join(temp, "Fake.png");
  await fs.writeFile(fake, "not an image");
  await choose([fake]);
  await page
    .getByRole("button", { name: /Image to PDF Combine images/ })
    .click();
  await expect(page.getByRole("alert")).toContainText("couldn't be opened");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  // Exercise the main-process session contract: one page is saved before cancellation.
  await choose([pdf]);
  const registered = await page.evaluate(async () => {
    const result = await window.paperin.pickFiles(false);
    if (!result.ok) throw new Error(result.error);
    return result.value[0].id;
  });
  await choose([temp]);
  const start = await page.evaluate(
    async (id) =>
      window.paperin.conversionBegin({
        type: "pdf-to-image",
        sourceId: id,
        pages: [1, 2, 3],
        format: "png",
        dpi: 72,
        quality: 0.92,
      }),
    registered,
  );
  if (!start.ok || !start.value)
    throw new Error("Couldn't start fixture conversion");
  const id = start.value.id;
  const image = await fs.readFile(png);
  const appended = await page.evaluate(
    ({ id, bytes }) =>
      window.paperin.conversionAppend(id, new Uint8Array(bytes)),
    { id, bytes: [...image] },
  );
  expect(appended.ok).toBe(true);
  const aborted = await page.evaluate(
    (id) => window.paperin.conversionAbort(id, false),
    id,
  );
  expect(aborted.ok && aborted.value.status).toBe("cancelled");
  expect(aborted.ok && aborted.value.outputs.length).toBe(1);
  await choose([pdf]);
  await page.getByRole("button", { name: /PDF to Image Save PDF/ }).click();
  await page.getByLabel("Pages", { exact: true }).selectOption("current");
  await page.getByLabel("Output format", { exact: true }).selectOption("png");
  await save(png);
  await page.locator(".convert-export button").click();
  await expect(page.getByRole("alert")).toContainText("original");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await dismiss();
  await page.getByLabel("Pages", { exact: true }).selectOption("all");
  await page.getByLabel("Output format", { exact: true }).selectOption("png");
  await choose([temp]);
  await page.locator(".convert-export button").click();
  await page.getByRole("button", { name: "Cancel conversion" }).click();
  await expect(
    page.getByText("Conversion cancelled.", { exact: true }),
  ).toBeVisible();
  expect(
    (await fs.readdir(temp)).filter((name) =>
      name.startsWith(".paperin-export-"),
    ),
  ).toEqual([]);
  for (const [location, digest] of originals)
    expect(hash(await fs.readFile(location))).toBe(digest);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
test("offers PDF to Image directly from Reader and works at the minimum window size", async () => {
  await dismiss();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reader", exact: true })
    .click();
  const leave = page.getByRole("button", { name: "Leave workspace" });
  if (await leave.isVisible()) await leave.click();
  await choose([pdf]);
  await page
    .getByRole("button", { name: /^Open (a PDF|another PDF)$/ })
    .click();
  await page.getByRole("button", { name: "Convert PDF to images" }).click();
  await expect(
    page.getByRole("heading", { name: "PDF to Image", exact: true }),
  ).toBeVisible();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(900, 600),
  );
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .last()
    .click();
  await expect(page.locator(".convert-export button")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/screenshots/convert-minimum.png",
  });
});
test("reports disk-full failures without replacing an existing destination", async () => {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1280, 860),
  );
  await page.getByLabel("Pages", { exact: true }).selectOption("current");
  await page.getByLabel("Output format", { exact: true }).selectOption("png");
  const destination = path.join(temp, "Preserved.png"),
    before = await fs.readFile(png);
  await fs.writeFile(destination, before);
  await save(destination);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({
      response: 1,
      checkboxChecked: false,
    })) as any;
    const filesystem = process.getBuiltinModule("fs/promises") as any,
      write = filesystem.writeFile;
    (globalThis as any).restoreConversionWrite = () => {
      filesystem.writeFile = write;
    };
    filesystem.writeFile = async (...args: any[]) => {
      if (String(args[0]).endsWith(".output"))
        throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
      return write(...args);
    };
  });
  try {
    await page.locator(".convert-export button").click();
    await expect(page.getByRole("alert")).toContainText(
      "Not enough disk space",
    );
    expect(await fs.readFile(destination)).toEqual(before);
    expect(
      (await fs.readdir(temp)).filter((name) =>
        name.startsWith(".paperin-export-"),
      ),
    ).toEqual([]);
  } finally {
    await app.evaluate(() => (globalThis as any).restoreConversionWrite());
  }
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await dismiss();
});
test("processes a hundred-image batch with a responsive renderer", async () => {
  await back();
  await choose(Array.from({ length: 100 }, () => jpeg));
  await page
    .getByRole("button", { name: /Image to PDF Combine images/ })
    .click();
  await expect(page.locator(".convert-image-card")).toHaveCount(103);
  await page.getByLabel("Image fit", { exact: true }).selectOption("contain");
  const destination = path.join(temp, "Large-batch.pdf");
  await save(destination);
  await page.evaluate(() => {
    (window as any).conversionTicks = 0;
    (window as any).conversionTimer = setInterval(() => {
      (window as any).conversionTicks++;
    }, 20);
  });
  await page.locator(".convert-export button").click();
  await expect(page.getByText("Conversion completed.")).toBeVisible({
    timeout: 45000,
  });
  const ticks = await page.evaluate(() => {
    clearInterval((window as any).conversionTimer);
    return (window as any).conversionTicks;
  });
  expect(ticks).toBeGreaterThan(5);
  expect(
    (await PDFDocument.load(await fs.readFile(destination))).getPageCount(),
  ).toBe(103);
  for (const [location, digest] of originals)
    expect(hash(await fs.readFile(location))).toBe(digest);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
test("routes native file drops, asks about mixed types, and removes selected images together", async () => {
  async function drop(paths: string[]) {
    await page.evaluate(() => {
      document.getElementById("test-drop-input")?.remove();
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.id = "test-drop-input";
      input.hidden = true;
      document.body.append(input);
    });
    await page.locator("#test-drop-input").setInputFiles(paths);
    await page.evaluate(() => {
      const input = document.getElementById(
        "test-drop-input",
      ) as HTMLInputElement;
      const transfer = new DataTransfer();
      for (const file of input.files!) transfer.items.add(file);
      document
        .querySelector(".app-shell")!
        .dispatchEvent(
          new DragEvent("drop", { bubbles: true, dataTransfer: transfer }),
        );
      input.remove();
    });
  }
  await dismiss();
  await drop([png, pdf]);
  await expect(
    page.getByRole("heading", { name: "Choose a conversion" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "PDF to Image", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "PDF to Image", exact: true }),
  ).toBeVisible();
  await drop([png]);
  await expect(page.locator(".convert-image-card")).toHaveCount(104);
  await page
    .getByRole("checkbox", { name: "Select Transparent.png", exact: true })
    .first()
    .check();
  await page
    .getByRole("checkbox", { name: "Select Phone.jpg", exact: true })
    .check();
  await page.getByRole("button", { name: "Remove 2", exact: true }).click();
  await expect(page.locator(".convert-image-card")).toHaveCount(102);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
test("converts an unlocked encrypted PDF and preserves the Reader current page", async () => {
  const protectedPath = path.join(temp, "Protected.pdf");
  execFileSync(
    path.resolve("resources/binaries/qpdf/bin/qpdf.exe"),
    [
      pdf,
      "--encrypt",
      "test-password",
      "owner-password",
      "256",
      "--",
      protectedPath,
    ],
    { windowsHide: true },
  );
  await dismiss();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Reader", exact: true })
    .click();
  const leave = page.getByRole("button", { name: "Leave workspace" });
  if (await leave.isVisible()) await leave.click();
  await choose([protectedPath]);
  await page
    .getByRole("button", { name: /^Open (a PDF|another PDF)$/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "This PDF is password protected" }),
  ).toBeVisible();
  await page
    .getByLabel("Document password", { exact: true })
    .fill("test-password");
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await page.getByRole("button", { name: "Go to page 2", exact: true }).click();
  await page.getByRole("button", { name: "Convert PDF to images" }).click();
  await expect(page.getByText("3 selected · Current page 2")).toBeVisible();
  await page.getByLabel("Pages", { exact: true }).selectOption("current");
  await page.getByLabel("Output format", { exact: true }).selectOption("png");
  await page.getByLabel("Resolution", { exact: true }).selectOption("72");
  const destination = path.join(temp, "Unlocked-page.png");
  await save(destination);
  await page.locator(".convert-export button").click();
  await expect(page.getByText("Conversion completed.")).toBeVisible();
  const output = PNG.sync.read(await fs.readFile(destination));
  expect([output.width, output.height]).toEqual([72, 144]);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
