import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "paperin-package-smoke-"));
let app;
try {
  app = await electron.launch({
    executablePath: path.resolve(
      process.env.PAPERIN_SMOKE_EXECUTABLE ||
        "dist/Paperin-win32-x64/Paperin.exe",
    ),
  });
  const page = await app.firstWindow();
  expect(await app.evaluate(({ app }) => app.getName())).toBe("Paperin");
  await expect(page).toHaveTitle("Paperin — Your PDF workspace");
  await expect(page.locator(".brand strong")).toHaveText("Paperin");
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
  const signature = new PNG({ width: 120, height: 40 });
  for (let y = 12; y < 28; y++)
    for (let x = 10; x < 110; x++) {
      const i = (y * 120 + x) * 4;
      signature.data[i] = 30;
      signature.data[i + 1] = 60;
      signature.data[i + 2] = 100;
      signature.data[i + 3] = 200;
    }
  const imagePath = path.join(temp, "Signature.png");
  await fs.writeFile(imagePath, PNG.sync.write(signature));
  await app.evaluate(({ dialog }, location) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [location],
    });
  }, imagePath);
  await page
    .getByRole("button", { name: "Add Signature", exact: true })
    .click();
  await page.getByRole("button", { name: "Choose PNG", exact: true }).click();
  await expect(page.getByAltText("Imported signature")).toBeVisible();
  await page
    .getByRole("button", { name: "Place Signature", exact: true })
    .click();
  await page
    .getByLabel("Signature editor page 1", { exact: true })
    .click({ position: { x: 120, y: 160 } });
  await page.screenshot({
    path: "test-results/screenshots/packaged-signature.png",
  });
  const signedOutput = path.join(temp, "packaged-signed.pdf");
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: destination,
    });
  }, signedOutput);
  await page
    .getByRole("button", { name: "Save As", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("PDF saved successfully.", { exact: true }),
  ).toBeVisible();
  expect(
    (await PDFDocument.load(await fs.readFile(signedOutput))).getPageCount(),
  ).toBe(8);
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Dismiss success", exact: true })
    .click();
  const output = path.join(temp, "packaged-extract.pdf");
  await app.evaluate(({ dialog }, destination) => {
    dialog.showSaveDialog = async () => ({
      canceled: false,
      filePath: destination,
    });
  }, output);
  const result = await page.evaluate(async () => {
    const source = await window.paperin.sample();
    if (!source.ok) throw new Error(source.error);
    return window.paperin.export({
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
    "Packaged Windows app: offline PDF.js reader, text layer, signature worker/PNG import/signed PDF export, and native qpdf page export all passed.",
  );
} finally {
  if (app) await app.evaluate(({ app }) => app.exit());
  if (path.basename(temp).startsWith("paperin-package-smoke-"))
    await fs.rm(temp, { recursive: true, force: true });
}
