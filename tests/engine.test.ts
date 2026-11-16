import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  PDFDocument,
  StandardFonts,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import {
  assertNotSource,
  generateOutput,
  runQpdf,
  validatePlan,
  type RegisteredFile,
} from "../src/main/pdf-engine";
import { splitPlan } from "../src/shared/plans";
const binary = path.resolve("resources/binaries/qpdf/bin/qpdf.exe");
let temp: string;
const files = new Map<string, RegisteredFile>();
const ids = [randomUUID(), randomUUID(), randomUUID()];
const hashes: string[] = [];
async function fixture(count: number, label: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < count; i++)
    pdf
      .addPage()
      .drawText(`${label} page ${i + 1}`, { x: 50, y: 700, size: 20, font });
  const location = path.join(temp, `${label}.pdf`);
  await fs.writeFile(location, await pdf.save());
  return location;
}
beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "folio-test-"));
  for (const [i, count] of [5, 7, 23].entries()) {
    const location = await fixture(count, `source-${i}`);
    files.set(ids[i], { path: location });
    hashes.push(
      createHash("sha256")
        .update(await fs.readFile(location))
        .digest("hex"),
    );
  }
});
afterAll(async () => {
  for (const [i, file] of [...files.values()].slice(0, 3).entries())
    expect(
      createHash("sha256")
        .update(await fs.readFile(file.path))
        .digest("hex"),
    ).toBe(hashes[i]);
  if (temp && path.basename(temp).startsWith("folio-test-"))
    await fs.rm(temp, { recursive: true, force: true });
});
describe("real qpdf engine", () => {
  it("merges five and seven pages into a validated twelve-page PDF", async () => {
    const output = {
      name: "merged.pdf",
      sources: [
        { id: ids[0], pages: [1, 2, 3, 4, 5] },
        { id: ids[1], pages: [1, 2, 3, 4, 5, 6, 7] },
      ],
    };
    await validatePlan(binary, { outputs: [output] }, files);
    const dest = path.join(temp, "merged.pdf");
    await generateOutput(binary, output, files, dest);
    expect(Number(await runQpdf(binary, ["--show-npages", dest]))).toBe(12);
  });
  it("extracts precisely the specified pages and preserves their order", async () => {
    const selected = [1, 2, 3, 7, 10, 11, 12];
    const plan = splitPlan(ids[2], 23, selected, "extract", "", 5, "extracted");
    const dest = path.join(temp, "extracted.pdf");
    await generateOutput(binary, plan.outputs[0], files, dest);
    const result = await PDFDocument.load(await fs.readFile(dest));
    expect(result.getPageCount()).toBe(7);
    for (const [i, page] of result.getPages().entries()) {
      const contents = page.node.Contents();
      const streams =
        contents instanceof PDFArray
          ? contents
              .asArray()
              .map((ref) => result.context.lookup(ref) as PDFRawStream)
          : [contents as PDFRawStream];
      const decoded = streams
        .map((stream) =>
          Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1"),
        )
        .join("");
      const expected = Buffer.from(`source-2 page ${selected[i]}`).toString(
        "hex",
      );
      expect(decoded.toLowerCase()).toContain(expected);
    }
  });
  it("writes all five parts for 23 pages split every five", async () => {
    const plan = splitPlan(ids[2], 23, [], "every", "", 5, "parts");
    await validatePlan(binary, plan, files);
    const counts = [];
    for (const output of plan.outputs) {
      const dest = path.join(temp, output.name);
      await generateOutput(binary, output, files, dest);
      counts.push(Number(await runQpdf(binary, ["--show-npages", dest])));
    }
    expect(counts).toEqual([5, 5, 5, 5, 3]);
  });
  it("rejects pages outside the actual source length", async () => {
    await expect(
      validatePlan(
        binary,
        {
          outputs: [{ name: "bad.pdf", sources: [{ id: ids[0], pages: [6] }] }],
        },
        files,
      ),
    ).rejects.toThrow("exceeds");
  });
  it("refuses to overwrite an original source", async () => {
    await expect(
      assertNotSource(files.get(ids[0])!.path, files),
    ).rejects.toThrow("original");
  });
  it("rejects traversal in output names", async () => {
    await expect(
      validatePlan(
        binary,
        {
          outputs: [
            { name: "../bad.pdf", sources: [{ id: ids[0], pages: [1] }] },
          ],
        },
        files,
      ),
    ).rejects.toThrow();
  });
  it("handles encrypted input with an in-memory password", async () => {
    const encrypted = path.join(temp, "protected.pdf");
    await runQpdf(binary, [
      files.get(ids[0])!.path,
      "--encrypt",
      "folio-test",
      "owner-test",
      "256",
      "--",
      encrypted,
    ]);
    const id = randomUUID();
    files.set(id, { path: encrypted });
    const plan = {
      outputs: [{ name: "unlocked.pdf", sources: [{ id, pages: [2, 4] }] }],
    };
    await expect(validatePlan(binary, plan, files)).rejects.toThrow("password");
    files.get(id)!.password = "folio-test";
    await validatePlan(binary, plan, files);
    await generateOutput(
      binary,
      plan.outputs[0],
      files,
      path.join(temp, "unlocked.pdf"),
    );
    expect(
      Number(
        await runQpdf(binary, [
          "--show-npages",
          path.join(temp, "unlocked.pdf"),
        ]),
      ),
    ).toBe(2);
  });
});
