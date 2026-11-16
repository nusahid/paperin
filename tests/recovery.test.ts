import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { recoverExports, trackExport } from "../src/main/recovery";
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "folio-recovery-test-"));
});
afterEach(async () => {
  if (root && path.basename(root).startsWith("folio-recovery-test-"))
    await fs.rm(root, { recursive: true, force: true });
});
it("cleans only owned export staging after a simulated crash", async () => {
  const staging = await fs.mkdtemp(path.join(root, ".folio-export-"));
  const journal = path.join(root, "journal.json");
  await trackExport(journal, staging);
  await fs.writeFile(path.join(staging, "0.pdf"), "incomplete output");
  await recoverExports(journal);
  await expect(fs.access(staging)).rejects.toThrow();
  await expect(fs.access(journal)).rejects.toThrow();
});
it("does not delete an unknown folder, even if a journal points to it", async () => {
  const unknown = await fs.mkdtemp(path.join(root, ".folio-export-"));
  await fs.writeFile(path.join(unknown, "keep.pdf"), "original");
  const journal = path.join(root, "journal.json");
  await fs.writeFile(journal, JSON.stringify([unknown, root]));
  await recoverExports(journal);
  expect(await fs.readFile(path.join(unknown, "keep.pdf"), "utf8")).toBe(
    "original",
  );
});
