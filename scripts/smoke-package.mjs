import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PDFDocument } from "pdf-lib";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "folio-package-smoke-"));
let app;
try {
  app = await electron.launch({
    executablePath: path.resolve("dist/Folio-win32-x64/Folio.exe"),
  });
  const page = await app.firstWindow();
  const errors = [],
    remote = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) remote.push(request.url());
  });
  await app.evaluate(({ session }) =>
    session.defaultSession.enableNetworkEmulation({ offline: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Your PDF workspace." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try a sample PDF" }).click();
  await expect(page.getByText("Page 1 of 8", { exact: true })).toBeVisible();
  await expect(
    page.locator(".reading-page").first().locator(".textLayer"),
  ).toContainText("A little room");
  const output = path.join(temp, "packaged-extract.pdf");
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: destination,
    });
  }, output);
  const result = await page.evaluate(async () => {
    const source = await window.folio.sample();
    if (!source.ok) throw new Error(source.error);
    return window.folio.export({
      outputs: [
        {
          name: "packaged-extract.pdf",
          sources: [{ id: source.value[0].id, pages: [2, 4] }],
        },
      ],
    });
  });
  if (!result.ok || !result.value?.length)
    throw new Error("Packaged qpdf export failed: " + JSON.stringify(result));
  const pdf = await PDFDocument.load(await fs.readFile(output));
  expect(pdf.getPageCount()).toBe(2);
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
  await page.screenshot({
    path: "test-results/screenshots/packaged-reader.png",
  });
  console.log(
    "Packaged Windows app: offline sample, PDF.js, text layer, native qpdf export, and 2-page output all passed.",
  );
} finally {
  if (app) await app.evaluate(({ app }) => app.exit());
  if (path.basename(temp).startsWith("folio-package-smoke-"))
    await fs.rm(temp, { recursive: true, force: true });
}
