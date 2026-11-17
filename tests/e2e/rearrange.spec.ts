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
import { PDFDocument, PDFName, StandardFonts } from "pdf-lib";

let app: ElectronApplication,
  page: Page,
  temp: string,
  source: string,
  originalHash: string;
const errors: string[] = [],
  network: string[] = [];
test.describe.configure({ mode: "serial" });
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
async function pick(filePath: string) {
  await app.evaluate(({ dialog }, location) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [location],
    })) as any;
  }, filePath);
}
async function saveTo(filePath: string) {
  await app.evaluate(({ dialog }, location) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: location,
    })) as any;
  }, filePath);
}
const card = (id: number) =>
  page.locator(`.rearrange-page[data-original="${id}"]`);
const order = () =>
  page
    .locator(".rearrange-page")
    .evaluateAll((elements) =>
      elements.map((e) => Number((e as HTMLElement).dataset.original)),
    );
async function dragPage(id: number, targetId: number, after = false) {
  const source = card(id),
    target = card(targetId);
  await source.scrollIntoViewIfNeeded();
  await source.hover({ position: { x: 70, y: 60 } });
  await page.mouse.down();
  try {
    // Start the native drag before scrolling the target into view. A single
    // dragTo move can reach the target without issuing dragover on CI runners.
    const start = await source.boundingBox();
    if (!start) throw new Error("The drag source is unavailable.");
    await page.mouse.move(start.x + 82, start.y + 72, { steps: 6 });
    await expect(source).toHaveClass(/\bmoving\b/);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("The drop target is unavailable.");
    const position = { x: after ? box.width - 8 : 8, y: 80 };
    // Two target moves reliably deliver dragover, as recommended by Playwright.
    await target.hover({ position });
    await target.hover({ position });
    await expect(page.locator(".insert-before, .insert-after")).toBeVisible();
  } finally {
    await page.mouse.up();
  }
}
test.beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "paperin-rearrange-e2e-"));
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 8; i++)
    pdf
      .addPage(i % 2 ? [595, 842] : [842, 595])
      .drawText(`Unique page ${i}`, { x: 50, y: 400, size: 30, font });
  source = path.join(temp, "Page order notes.pdf");
  await fs.writeFile(source, await pdf.save());
  originalHash = hash(await fs.readFile(source));
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
  if (source) expect(hash(await fs.readFile(source))).toBe(originalHash);
  if (temp && path.basename(temp).startsWith("paperin-rearrange-e2e-"))
    await fs.rm(temp, { recursive: true, force: true });
});

test("rearranges single and multiple pages, previews, saves and reopens offline", async () => {
  await page
    .getByRole("button", { name: /Rearrange Pages Change the order/ })
    .click();
  await pick(source);
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reverse Pages", exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      card(1)
        .locator("canvas")
        .evaluate((e: HTMLCanvasElement) => e.width),
    )
    .toBeGreaterThan(100);
  await page.screenshot({
    path: "test-results/screenshots/rearrange-initial.png",
  });
  await dragPage(8, 2);
  await expect.poll(order).toEqual([1, 8, 2, 3, 4, 5, 6, 7]);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  await card(2).click();
  await card(4).click({ modifiers: ["Control"] });
  await expect(card(2)).toHaveAttribute("aria-pressed", "true");
  await dragPage(2, 8, true);
  await expect.poll(order).toEqual([1, 3, 5, 6, 7, 8, 2, 4]);
  await page
    .getByRole("button", { name: "Reverse Pages", exact: true })
    .click();
  await expect.poll(order).toEqual([4, 2, 8, 7, 6, 5, 3, 1]);
  await card(4).focus();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(order).toEqual([4, 2, 8, 7, 6, 5, 3, 1]);
  await page.getByRole("button", { name: "Reset Order", exact: true }).click();
  await expect.poll(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  await card(2).click();
  await card(4).click({ modifiers: ["Shift"] });
  await expect(page.locator(".rearrange-status")).toContainText("3 selected");
  await page.keyboard.press("Alt+ArrowRight");
  await expect.poll(order).toEqual([1, 5, 2, 3, 4, 6, 7, 8]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".rearrange-status")).toContainText("0 selected");
  await card(1).dblclick();
  await expect(page.getByRole("dialog")).toContainText(
    "Page 1 of 8 · Originally page 1",
  );
  await page.getByRole("button", { name: "Next preview page" }).click();
  await expect(page.getByRole("dialog")).toContainText("Originally page 5");
  await expect(page.getByRole("dialog").locator(".textLayer")).toContainText(
    "Unique page 5",
  );
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.screenshot({ path: "test-results/screenshots/rearrange.png" });
  const output = path.join(temp, "Reordered notes.pdf");
  await saveTo(output);
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(
    page.getByText("PDF saved successfully.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".rearrange-status")).toContainText(
    "All changes saved",
  );
  expect(
    (await PDFDocument.load(await fs.readFile(output))).getPageCount(),
  ).toBe(8);
  await page.getByRole("button", { name: "Open file", exact: true }).click();
  await expect(
    page.locator(".reading-page").first().locator(".textLayer"),
  ).toContainText("Unique page 1");
  await page
    .getByRole("textbox", { name: "Page number", exact: true })
    .fill("2");
  await page
    .getByRole("textbox", { name: "Page number", exact: true })
    .press("Enter");
  await expect(
    page.locator(".reading-page").nth(1).locator(".textLayer"),
  ).toContainText("Unique page 5");
  await page
    .getByRole("textbox", { name: "Page number", exact: true })
    .fill("8");
  await page
    .getByRole("textbox", { name: "Page number", exact: true })
    .press("Enter");
  await expect(
    page.locator(".reading-page").last().locator(".textLayer"),
  ).toContainText("Unique page 8");
  await page
    .getByRole("button", { name: "Rearrange Pages", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reverse Pages", exact: true }),
  ).toBeEnabled();
  await expect.poll(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});

test("protects source, handles cancellation, blocks signatures and virtualizes 1000 pages", async () => {
  await page
    .getByRole("button", { name: "Reverse Pages", exact: true })
    .click();
  // Save As cannot overwrite any registered input, including this reopened output.
  await saveTo(source);
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("original");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = (async () => ({ canceled: true })) as any;
  });
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reverse Pages", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".rearrange-status")).toContainText(
    "Unsaved changes",
  );
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Home", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Discard your changes?");
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  const signed = await PDFDocument.load(await fs.readFile(source));
  signed.catalog.set(
    PDFName.of("Perms"),
    signed.context.obj({ DocMDP: { Type: "Sig", ByteRange: [0, 1, 2, 3] } }),
  );
  const signedPath = path.join(temp, "signed.pdf");
  await fs.writeFile(signedPath, await signed.save());
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Rearrange", exact: true })
    .click();
  await pick(signedPath);
  await page
    .getByRole("button", { name: "Open another PDF", exact: true })
    .click();
  await expect(page.locator(".rearrange-warning")).toContainText(
    "digital signature",
  );
  await page
    .getByRole("button", { name: "Reverse Pages", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save As", exact: true }),
  ).toBeDisabled();
  const large = await PDFDocument.create();
  const font = await large.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 1000; i++)
    large.addPage().drawText(`Large page ${i}`, { x: 40, y: 700, font });
  const largePath = path.join(temp, "1000 pages.pdf");
  await fs.writeFile(largePath, await large.save());
  await pick(largePath);
  await page
    .getByRole("button", { name: "Open another PDF", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Choose another PDF", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reverse Pages", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".rearrange-status")).toContainText("1000 pages");
  expect(await page.locator(".rearrange-page").count()).toBeLessThan(60);
  await page
    .getByRole("button", { name: "Reverse Pages", exact: true })
    .click();
  await expect(page.locator(".rearrange-page").first()).toHaveAttribute(
    "data-original",
    "1000",
  );
  await page.getByRole("button", { name: "Reset Order", exact: true }).click();
  await page.locator(".rearrange-scroll").evaluate((e) => {
    e.scrollTop = e.scrollHeight;
  });
  await expect(card(1000)).toBeVisible();
  expect(await page.locator(".rearrange-page").count()).toBeLessThan(60);
  await page.screenshot({
    path: "test-results/screenshots/rearrange-large.png",
  });
  const initialScroll = await page
    .locator(".rearrange-scroll")
    .evaluate((e) => e.scrollTop);
  const sourceBox = await card(1000).boundingBox();
  const gridBox = await page.locator(".rearrange-scroll").boundingBox();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + 60);
  await page.mouse.down();
  await page.mouse.move(
    sourceBox!.x + sourceBox!.width / 2 - 12,
    sourceBox!.y + 48,
    { steps: 5 },
  );
  await page.mouse.move(gridBox!.x + gridBox!.width / 2, gridBox!.y + 5, {
    steps: 10,
  });
  await expect
    .poll(() => page.locator(".rearrange-scroll").evaluate((e) => e.scrollTop))
    .toBeLessThan(initialScroll - 700);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".rearrange-status")).toContainText(
    "Original order",
  );
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});

test("main-process guards handle collisions, invalid permutations and active cancellation", async () => {
  await pick(source);
  const id = await page.evaluate(async () => {
    const result = await window.paperin.pickFiles(false);
    if (!result.ok) throw new Error(result.error);
    return result.value[0].id;
  });
  const destination = path.join(temp, "Existing output.pdf");
  await fs.writeFile(destination, "Keep this previous output safe");
  const previous = hash(await fs.readFile(destination));
  await saveTo(destination);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0 })) as any;
  });
  const plan = { documentId: id, order: [8, 7, 6, 5, 4, 3, 2, 1] };
  const kept = await page.evaluate(
    (plan) => window.paperin.exportRearrange(plan),
    plan,
  );
  expect(kept.ok && kept.value?.name).toBe("Existing output (2).pdf");
  expect(hash(await fs.readFile(destination))).toBe(previous);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1 })) as any;
  });
  const invalid = await page.evaluate(
    (plan) =>
      window.paperin.exportRearrange({
        ...plan,
        order: [1, 1, 3, 4, 5, 6, 7, 8],
      }),
    plan,
  );
  expect(invalid.ok).toBe(false);
  expect(hash(await fs.readFile(destination))).toBe(previous);
  const canceled = await page.evaluate(async (plan) => {
    const operation = window.paperin.exportRearrange(plan);
    const timer = setTimeout(() => void window.paperin.cancelRearrange(), 50);
    try {
      return await operation;
    } finally {
      clearTimeout(timer);
    }
  }, plan);
  expect(canceled).toEqual({ ok: true, value: null });
  expect(hash(await fs.readFile(destination))).toBe(previous);
  const replaced = await page.evaluate(
    (plan) => window.paperin.exportRearrange(plan),
    plan,
  );
  expect(replaced.ok && replaced.value?.name).toBe("Existing output.pdf");
  expect(
    (await PDFDocument.load(await fs.readFile(destination))).getPageCount(),
  ).toBe(8);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 2 })) as any;
  });
  expect(
    await page.evaluate((plan) => window.paperin.exportRearrange(plan), plan),
  ).toEqual({ ok: true, value: null });
  expect(
    (await fs.readdir(temp)).filter((name) =>
      name.startsWith(".paperin-export-"),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
