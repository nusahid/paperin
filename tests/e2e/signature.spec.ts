import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { PDFDocument, PDFName, degrees } from "pdf-lib";
import { PNG } from "pngjs";
let app: ElectronApplication,
  page: Page,
  temp: string,
  pdfPath: string,
  pngPath: string;
const errors: string[] = [],
  network: string[] = [];
test.describe.configure({ mode: "serial" });
async function pick(location: string) {
  await app.evaluate(({ dialog }, location) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [location],
    })) as any;
  }, location);
}
async function save(location: string | null) {
  await app.evaluate(({ dialog }, location) => {
    dialog.showSaveDialog = (async () => ({
      canceled: !location,
      filePath: location ?? undefined,
    })) as any;
  }, location);
}
const placement = () => page.locator(".signature-placement.selected");
async function rect() {
  return placement().evaluate((el: HTMLElement) => ({
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
    width: parseFloat(el.style.width),
    height: parseFloat(el.style.height),
  }));
}
test.beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "folio-signature-e2e-"));
  const pdf = await PDFDocument.create();
  for (const rotation of [0, 90, 180, 270]) {
    const p = pdf.addPage([500, 420]);
    p.setCropBox(40, 70, 400, 300);
    p.setRotation(degrees(rotation));
    p.drawText(`Signature test page ${rotation / 90 + 1}`, {
      x: 60,
      y: 300,
      size: 18,
    });
  }
  pdfPath = path.join(temp, "Sign me.pdf");
  await fs.writeFile(pdfPath, await pdf.save());
  const image = new PNG({ width: 180, height: 60 });
  for (let y = 0; y < 60; y++)
    for (let x = 0; x < 180; x++) {
      const i = (y * 180 + x) * 4;
      image.data[i] = 35;
      image.data[i + 1] = 65;
      image.data[i + 2] = 105;
      image.data[i + 3] = y > 20 && y < 40 && x > 10 && x < 170 ? 200 : 0;
    }
  pngPath = path.join(temp, "Signature.png");
  await fs.writeFile(pngPath, PNG.sync.write(image));
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
});
test.afterAll(async () => {
  if (app) await app.evaluate(({ app }) => app.exit());
  if (temp && path.basename(temp).startsWith("folio-signature-e2e-"))
    await fs.rm(temp, { recursive: true, force: true });
});
test("offline editor places, drags, resizes, adjusts, undoes, and exports signatures across rotated pages", async () => {
  const original = createHash("sha256")
    .update(await fs.readFile(pdfPath))
    .digest("hex");
  await pick(pdfPath);
  await page.getByRole("button", { name: "Browse files", exact: true }).click();
  await expect(page.getByText("Page 1 of 4", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Add Signature", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Signature panel" }),
  ).toBeVisible();
  await pick(pngPath);
  await page.getByRole("button", { name: "Choose PNG", exact: true }).click();
  await expect(page.getByAltText("Imported signature")).toBeVisible();
  await page
    .getByRole("button", { name: "Place Signature", exact: true })
    .click();
  const overlay = page.getByLabel("Signature editor page 1", { exact: true });
  await overlay.click({ position: { x: 150, y: 170 } });
  await expect(placement()).toBeVisible();
  const start = await rect();
  expect(start.width / start.height).toBeCloseTo(3);
  const box = (await placement().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 30,
    box.y + box.height / 2 + 25,
    { steps: 12 },
  );
  await page.mouse.up();
  const moved = await rect();
  expect(moved.x - start.x).toBeCloseTo(30, 0);
  expect(moved.y - start.y).toBeCloseTo(25, 0);
  // One drag is one undo operation.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page
    .getByRole("button", { name: "Signature on page 1", exact: true })
    .click();
  expect((await rect()).x).toBeCloseTo(start.x);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page
    .getByRole("button", { name: "Signature on page 1", exact: true })
    .click();
  expect((await rect()).x).toBeCloseTo(moved.x);
  const handle = (await page.locator(".signature-handle.se").boundingBox())!;
  await page.mouse.move(handle.x + 4, handle.y + 4);
  await page.mouse.down();
  await page.mouse.move(handle.x + 44, handle.y + 20, { steps: 10 });
  await page.mouse.up();
  const resized = await rect();
  expect(resized.width).toBeGreaterThan(moved.width);
  expect(resized.width / resized.height).toBeCloseTo(3);
  // Physical keyboard increments are stable when zoom changes.
  await page
    .getByRole("combobox", { name: "Zoom", exact: true })
    .selectOption("100");
  await placement().focus();
  const one = await rect();
  await page.keyboard.press("ArrowRight");
  expect((await rect()).x - one.x).toBeCloseTo(1);
  await page
    .getByRole("combobox", { name: "Zoom", exact: true })
    .selectOption("200");
  await placement().focus();
  const two = await rect();
  await page.keyboard.press("ArrowRight");
  expect((await rect()).x - two.x).toBeCloseTo(2);
  await page.keyboard.press("Shift+ArrowDown");
  expect((await rect()).y - two.y).toBeCloseTo(20);
  await page
    .getByRole("combobox", { name: "Zoom", exact: true })
    .selectOption("50");
  expect((await rect()).width).toBeCloseTo(one.width * 0.5);
  await page
    .getByRole("combobox", { name: "Zoom", exact: true })
    .selectOption("fit-page");
  await page
    .getByRole("button", { name: "Place Signature", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".signature-ghost")).toHaveCount(0);
  for (const n of [2, 3, 4]) {
    await page
      .getByRole("textbox", { name: "Page number", exact: true })
      .fill(String(n));
    await page
      .getByRole("textbox", { name: "Page number", exact: true })
      .press("Enter");
    await page
      .getByRole("button", { name: "Place Signature", exact: true })
      .click();
    await page
      .getByLabel(`Signature editor page ${n}`, { exact: true })
      .click({ position: { x: 130, y: 160 } });
  }
  await expect(
    page.getByText("4 signatures on 4 pages", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/screenshots/signature-editor.png",
  });
  // Cancel Save As retains the edit session.
  await save(null);
  await page
    .getByRole("button", { name: "Save As", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("4 signatures on 4 pages", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".progress-toast")).toHaveCount(0);
  // File-source guard is also enforced through the signature export endpoint.
  await save(pdfPath);
  await page
    .getByRole("button", { name: "Save As", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText("original");
  await page
    .getByRole("button", { name: "Dismiss error", exact: true })
    .click();
  const dest = path.join(temp, "Signed.pdf");
  await save(dest);
  await page
    .getByRole("button", { name: "Save As", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("PDF saved successfully.", { exact: true }),
  ).toBeVisible();
  expect((await PDFDocument.load(await fs.readFile(dest))).getPageCount()).toBe(
    4,
  );
  expect(
    createHash("sha256")
      .update(await fs.readFile(pdfPath))
      .digest("hex"),
  ).toBe(original);
  await page.getByRole("button", { name: "Open file", exact: true }).click();
  await expect(page.getByText("Page 1 of 4", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Signature panel" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
test("image validation, replacement history, delete/redo, cancel confirmation and session release", async () => {
  await page
    .getByRole("button", { name: "Add Signature", exact: true })
    .click();
  const fake = path.join(temp, "Fake.png");
  await fs.writeFile(fake, "Not a PNG");
  await pick(fake);
  await page.getByRole("button", { name: "Choose PNG", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("choose a PNG");
  await page
    .getByRole("button", { name: "Dismiss error", exact: true })
    .click();
  await pick(pngPath);
  await page.getByRole("button", { name: "Choose PNG", exact: true }).click();
  await page
    .getByRole("button", { name: "Place Signature", exact: true })
    .click();
  await page
    .getByLabel("Signature editor page 1", { exact: true })
    .click({ position: { x: 110, y: 160 } });
  await page.getByLabel("Signature width", { exact: true }).fill("120");
  await page.getByLabel("Signature width", { exact: true }).press("Enter");
  await expect(
    page.getByLabel("Signature height", { exact: true }),
  ).toHaveValue("40");
  const replacement = path.join(temp, "Replacement.png");
  await fs.copyFile(pngPath, replacement);
  await pick(replacement);
  await page
    .getByRole("button", { name: "Replace Image", exact: true })
    .click();
  await expect(page.locator(".signature-image-name")).toHaveText(
    "Replacement.png",
  );
  await page.keyboard.press("Control+z");
  await expect(page.locator(".signature-image-name")).toHaveText(
    "Signature.png",
  );
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".signature-image-name")).toHaveText(
    "Replacement.png",
  );
  await page
    .getByRole("button", { name: "Signature on page 1", exact: true })
    .click();
  await page.keyboard.press("Delete");
  await expect(
    page.getByText("0 signatures on 0 pages", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(
    page.getByText("1 signature on 1 page", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Discard signature changes?",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Signature panel" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add Signature", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Choose PNG", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .first()
    .click();
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
test("main process rejects protected/signed PDFs and keeps existing output on failed export", async () => {
  const encrypted = path.join(temp, "Protected.pdf");
  execFileSync(
    path.resolve("resources/binaries/qpdf/bin/qpdf.exe"),
    [pdfPath, "--encrypt", "secret", "owner", "256", "--", encrypted],
    { windowsHide: true },
  );
  const signed = await PDFDocument.load(await fs.readFile(pdfPath));
  signed.catalog.set(
    PDFName.of("Perms"),
    signed.context.obj({
      DocMDP: signed.context.register(
        signed.context.obj({ Type: "Sig", ByteRange: [0, 10, 20, 10] }),
      ),
    }),
  );
  const signedPath = path.join(temp, "Digital.pdf");
  await fs.writeFile(signedPath, await signed.save());
  for (const [location, message] of [
    [encrypted, "protected"],
    [signedPath, "digital signature"],
  ]) {
    await pick(location);
    const r = await page.evaluate(async () => {
      const picked = await window.folio.pickFiles(false);
      if (!picked.ok) throw new Error(picked.error);
      return window.folio.beginSignature(picked.value[0].id);
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(message);
  }
  await pick(pdfPath);
  const sessionId = await page.evaluate(async () => {
    const picked = await window.folio.pickFiles(false);
    if (!picked.ok) throw new Error(picked.error);
    const r = await window.folio.beginSignature(picked.value[0].id);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  });
  const existing = path.join(temp, "Existing.pdf");
  await fs.copyFile(pdfPath, existing);
  const hash = createHash("sha256")
    .update(await fs.readFile(existing))
    .digest("hex");
  await save(existing);
  const r = await page.evaluate(
    ({ sessionId, id, imageId }) =>
      window.folio.exportSignature({
        sessionId,
        placements: [
          {
            id,
            imageId,
            pageIndex: 0,
            x: 70,
            y: 100,
            width: 90,
            height: 30,
            opacity: 1,
            rotation: 0,
          },
        ],
      }),
    { sessionId, id: randomUUID(), imageId: randomUUID() },
  );
  expect(r.ok).toBe(false);
  expect(
    createHash("sha256")
      .update(await fs.readFile(existing))
      .digest("hex"),
  ).toBe(hash);
  await page.evaluate((id) => window.folio.endSignature(id), sessionId);
  expect(
    (await page.evaluate((id) => window.folio.pickSignature(id), sessionId)).ok,
  ).toBe(false);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
