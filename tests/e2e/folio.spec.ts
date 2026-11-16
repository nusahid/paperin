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
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
let app: ElectronApplication, page: Page, temp: string;
let fixture: string, second: string;
const errors: string[] = [],
  network: string[] = [];
async function chooseFiles(paths: string[]) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: paths,
    })) as any;
  }, paths);
}
async function saveTo(filePath: string) {
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath,
    })) as any;
  }, filePath);
}
async function count(location: string) {
  return (await PDFDocument.load(await fs.readFile(location))).getPageCount();
}
async function leaveTo(name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
  const leave = page.getByRole("button", { name: "Leave workspace" });
  if (await leave.isVisible()) await leave.click();
}
test.beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "folio-e2e-"));
  const create = async (name: string, n: number) => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= n; i++)
      pdf
        .addPage([595.28, 841.89])
        .drawText(`Chapter ${i}. A quieter workspace.`, {
          x: 56,
          y: 700,
          size: 24,
          font,
        });
    const location = path.join(temp, name);
    await fs.writeFile(location, await pdf.save());
    return location;
  };
  fixture = await create("Field notes.pdf", 23);
  second = await create("Weekly report.pdf", 7);
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
  if (app) {
    await page.evaluate(() => {
      window.onbeforeunload = null;
    });
    await app.evaluate(({ app }) => app.exit());
  }
  if (temp && path.basename(temp).startsWith("folio-e2e-"))
    await fs.rm(temp, { recursive: true, force: true });
});
test("Home renders the reference layout and local settings", async () => {
  await expect(
    page.getByRole("heading", { name: "Your PDF workspace." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Browse files" }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/home.png" });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByText("All documents are processed on this device."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to your workspace" }).click();
});
test("Reader renders actual PDF pages, navigation, selectable text and search offline", async () => {
  await page.getByRole("button", { name: "Try a sample PDF" }).click();
  await expect(page.getByText("Page 1 of 8")).toBeVisible();
  await expect(
    page
      .locator(".reading-page .textLayer span")
      .filter({ hasText: "A little room" })
      .first(),
  ).toBeVisible();
  expect(
    await page
      .locator(".reading-page canvas")
      .first()
      .evaluate((canvas: HTMLCanvasElement) => canvas.width),
  ).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Go to page 4", exact: true }).click();
  await expect(page.getByText("Page 4 of 8")).toBeVisible();
  await page
    .getByRole("button", { name: "Previous page", exact: true })
    .click();
  await expect(page.getByText("Page 3 of 8")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Zoom", exact: true })
    .selectOption("100");
  await page
    .getByRole("button", { name: "Search document", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search text", exact: true })
    .fill("cloud");
  await expect(page.getByText(/matching pages?/)).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/reader.png" });
  await page.getByRole("button", { name: "Close search", exact: true }).click();
});
test("Merge reorders local inputs, previews composition, and saves a validated PDF", async () => {
  const original = createHash("sha256")
    .update(await fs.readFile(fixture))
    .digest("hex");
  await leaveTo("Merge");
  await chooseFiles([fixture, second]);
  await page
    .getByRole("button", { name: "Add PDF files", exact: true })
    .click();
  await expect(page.getByText("Ready to bring it together")).toBeVisible();
  await page
    .getByRole("button", { name: "Move Weekly report.pdf up", exact: true })
    .click();
  await expect(page.locator(".merge-row").first()).toContainText(
    "Weekly report.pdf",
  );
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A look before you save" }),
  ).toBeVisible();
  await expect(page.locator(".preview-source").first()).toContainText(
    "Weekly report.pdf",
  );
  await page.screenshot({ path: "test-results/screenshots/preview.png" });
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await page.screenshot({ path: "test-results/screenshots/merge.png" });
  const destination = path.join(temp, "merged.pdf");
  await saveTo(destination);
  await page.getByRole("button", { name: "Merge & save", exact: true }).click();
  await expect(
    page.getByText("PDF saved successfully.", { exact: true }),
  ).toBeVisible();
  expect(await count(destination)).toBe(30);
  expect(
    createHash("sha256")
      .update(await fs.readFile(fixture))
      .digest("hex"),
  ).toBe(original);
  await page.getByRole("button", { name: "Open file", exact: true }).click();
  await expect(page.getByText("Page 1 of 30", { exact: true })).toBeVisible();
});
test("Split extracts, removes, validates ranges and exports all parts offline", async () => {
  await leaveTo("Split");
  await chooseFiles([fixture]);
  await page.getByRole("button", { name: "Open a PDF", exact: true }).click();
  await page
    .getByLabel("Or select by range", { exact: true })
    .fill("1-3, 7, 10-12");
  await page.getByRole("button", { name: "Apply range" }).click();
  await expect(page.getByText("7 selected", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/split.png" });
  let destination = path.join(temp, "extracted.pdf");
  await saveTo(destination);
  await page
    .getByRole("button", { name: "Extract & save", exact: true })
    .click();
  await expect(
    page.getByText("PDF saved successfully.", { exact: true }),
  ).toBeVisible();
  expect(await count(destination)).toBe(7);
  await page.getByRole("button", { name: "Dismiss success" }).click();
  await page.getByLabel("Split mode", { exact: true }).selectOption("remove");
  destination = path.join(temp, "remaining.pdf");
  await saveTo(destination);
  await page
    .getByRole("button", { name: "Remove & save", exact: true })
    .click();
  await expect(
    page.getByText("PDF saved successfully.", { exact: true }),
  ).toBeVisible();
  expect(await count(destination)).toBe(16);
  await page.getByRole("button", { name: "Dismiss success" }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(
    page.getByText("Keep at least one page in the new document."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove & save", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Split mode", { exact: true }).selectOption("ranges");
  await page.getByLabel("Page ranges", { exact: true }).fill("1-24");
  await expect(page.getByText(/Choose pages between 1 and 23/)).toBeVisible();
  await page.getByLabel("Page ranges", { exact: true }).fill("1-3; 4-7");
  await chooseFiles([temp]);
  await page.getByRole("button", { name: "Split & save", exact: true }).click();
  await expect(page.getByText("2 PDFs saved successfully.")).toBeVisible();
  expect(await count(path.join(temp, "Field notes_split_part_001.pdf"))).toBe(
    3,
  );
  expect(await count(path.join(temp, "Field notes_split_part_002.pdf"))).toBe(
    4,
  );
  await page.getByRole("button", { name: "Dismiss success" }).click();
  await page.getByLabel("Split mode", { exact: true }).selectOption("every");
  await page.getByLabel("Pages in each PDF", { exact: true }).fill("5");
  await page
    .getByLabel("Output name prefix", { exact: true })
    .fill("Every-five");
  await page.getByRole("button", { name: "Split & save", exact: true }).click();
  await expect(page.getByText("5 PDFs saved successfully.")).toBeVisible();
  const counts = [];
  for (let i = 1; i <= 5; i++)
    counts.push(
      await count(
        path.join(temp, `Every-five_part_${String(i).padStart(3, "0")}.pdf`),
      ),
    );
  expect(counts).toEqual([5, 5, 5, 5, 3]);
  await page.getByRole("button", { name: "Dismiss success" }).click();
});
test("Bad files and encrypted PDFs are handled without crashing", async () => {
  await leaveTo("Reader");
  const invalid = path.join(temp, "invalid.pdf");
  await fs.writeFile(invalid, "not a PDF");
  await chooseFiles([invalid]);
  await page
    .getByRole("button", { name: /^Open (another PDF|a PDF)$/ })
    .click();
  await expect(page.getByRole("alert")).toContainText("damaged");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  const protectedPath = path.join(temp, "protected.pdf");
  execFileSync(
    path.resolve("resources/binaries/qpdf/bin/qpdf.exe"),
    [
      second,
      "--encrypt",
      "test-password",
      "owner-password",
      "256",
      "--",
      protectedPath,
    ],
    { windowsHide: true },
  );
  await chooseFiles([protectedPath]);
  await page
    .getByRole("button", { name: /^Open (another PDF|a PDF)$/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "This PDF is password protected" }),
  ).toBeVisible();
  await page.getByLabel("Document password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(
    page.getByText("That password didn't work. Please try again."),
  ).toBeVisible();
  await page
    .getByLabel("Document password", { exact: true })
    .fill("test-password");
  await page.getByRole("button", { name: "Open PDF", exact: true }).click();
  await expect(page.getByText("Page 1 of 7", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});

test("Export cancellation, source protection, sandboxing, and 200-page lazy rendering", async () => {
  const preferences = await app.evaluate(({ BrowserWindow }) => {
    const prefs = (
      BrowserWindow.getAllWindows()[0].webContents as any
    ).getLastWebPreferences();
    return {
      nodeIntegration: prefs.nodeIntegration,
      contextIsolation: prefs.contextIsolation,
      sandbox: prefs.sandbox,
    };
  });
  expect(preferences).toEqual({
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
  });
  await chooseFiles([fixture]);
  const id = await page.evaluate(async () => {
    const result = await window.folio.pickFiles(false);
    if (!result.ok) throw new Error(result.error);
    return result.value[0].id;
  });
  const plan = {
    outputs: [{ name: "guarded.pdf", sources: [{ id, pages: [1, 2] }] }],
  };
  await saveTo(fixture);
  const original = createHash("sha256")
    .update(await fs.readFile(fixture))
    .digest("hex");
  const guarded = await page.evaluate(
    (plan) => window.folio.export(plan),
    plan,
  );
  expect(guarded.ok).toBe(false);
  if (!guarded.ok) expect(guarded.error).toContain("original");
  expect(
    createHash("sha256")
      .update(await fs.readFile(fixture))
      .digest("hex"),
  ).toBe(original);
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = (async () => ({
      canceled: true,
      filePath: undefined,
    })) as any;
  });
  const canceled = await page.evaluate(
    (plan) => window.folio.export(plan),
    plan,
  );
  expect(canceled).toEqual({ ok: true, value: null });
  const large = await PDFDocument.create();
  const font = await large.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 200; n++)
    large.addPage().drawText(`Page ${n} of a larger document`, {
      x: 56,
      y: 700,
      size: 24,
      font,
    });
  const largePath = path.join(temp, "200 pages.pdf");
  await fs.writeFile(largePath, await large.save());
  await leaveTo("Reader");
  await chooseFiles([largePath]);
  await page
    .getByRole("button", { name: /^Open (another PDF|a PDF)$/ })
    .click();
  await expect(page.getByText("Page 1 of 200", { exact: true })).toBeVisible();
  expect(
    await page
      .locator(".reading-page canvas")
      .evaluateAll(
        (elements) =>
          elements.filter((element) => (element as HTMLCanvasElement).width > 1)
            .length,
      ),
  ).toBeLessThan(8);
  await page
    .getByRole("textbox", { name: "Page number", exact: true })
    .fill("200");
  await page
    .getByRole("textbox", { name: "Page number", exact: true })
    .press("Enter");
  await expect(
    page.getByText("Page 200 of 200", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".reading-page").last().locator(".textLayer"),
  ).toContainText("Page 200 of a larger document");
  expect(
    await page
      .locator(".reading-page canvas")
      .evaluateAll(
        (elements) =>
          elements.filter((element) => (element as HTMLCanvasElement).width > 1)
            .length,
      ),
  ).toBeLessThan(8);
  expect(errors).toEqual([]);
  expect(network).toEqual([]);
});
