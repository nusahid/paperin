import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from "pdf-lib";
import {
  commitOrder,
  movePages,
  originalOrder,
  redoOrder,
  sameOrder,
  undoOrder,
  validatePermutation,
} from "../src/shared/rearrange";
import { inspectRearrange } from "../src/main/pdf-engine/rearrange/inspect";
import {
  generateRearranged,
  snapshotSource,
} from "../src/main/pdf-engine/rearrange/service";
import { runQpdf } from "../src/main/pdf-engine";
import { useRearrange } from "../src/renderer/src/features/rearrange/store";
import { useApp } from "../src/renderer/src/store";

describe("page permutation and history", () => {
  it("moves one page and discontiguous selections at adjusted boundaries", () => {
    expect(movePages(originalOrder(5), [5], 1)).toEqual([1, 5, 2, 3, 4]);
    expect(movePages(originalOrder(8), [6, 2, 4], 8)).toEqual([
      1, 3, 5, 7, 8, 2, 4, 6,
    ]);
    expect(movePages([4, 3, 2, 1], [1, 3], 0)).toEqual([3, 1, 4, 2]);
  });
  it("maintains a complete permutation for every selection and insertion boundary", () => {
    const order = originalOrder(8);
    for (let mask = 0; mask < 256; mask++)
      for (let boundary = 0; boundary <= 8; boundary++) {
        const selected = order.filter((_, i) => mask & (1 << i));
        const result = movePages(order, selected, boundary);
        validatePermutation(result, 8);
        expect(result.filter((id) => selected.includes(id))).toEqual(selected);
        expect(result.filter((id) => !selected.includes(id))).toEqual(
          order.filter((id) => !selected.includes(id)),
        );
      }
  });
  it("ignores no-ops, reverses current order, restores history and clears a redo branch", () => {
    const initial = { order: originalOrder(6), past: [], future: [] };
    expect(commitOrder(initial, movePages(initial.order, [2, 3], 2))).toBe(
      initial,
    );
    const moved = commitOrder(initial, movePages(initial.order, [6], 1));
    const reversed = commitOrder(moved, [...moved.order].reverse());
    expect(undoOrder(undoOrder(reversed)).order).toEqual(initial.order);
    expect(redoOrder(redoOrder(undoOrder(undoOrder(reversed))))).toEqual(
      reversed,
    );
    expect(commitOrder(undoOrder(reversed), originalOrder(6)).future).toEqual(
      [],
    );
    expect(commitOrder(reversed, [...reversed.order].reverse()).order).toEqual(
      moved.order,
    );
    let history = initial as ReturnType<typeof commitOrder>;
    for (let i = 0; i < 60; i++)
      history = commitOrder(history, [...history.order].reverse());
    expect(history.past).toHaveLength(50);
    expect(() => validatePermutation([1, 1, 3], 3)).toThrow();
    expect(() => validatePermutation([0, 2, 3], 3)).toThrow();
    expect(() => validatePermutation([1, 2], 3)).toThrow();
  });
  it("selects ranges using the displayed order and tracks saved-order dirtiness", () => {
    const store = useRearrange.getState();
    store.begin("test", 8);
    store.reverse();
    store.select(7);
    store.select(4, false, true);
    expect(useRearrange.getState().selected).toEqual([7, 6, 5, 4]);
    store.select(2, true);
    store.move([7, 2], 8);
    expect(useRearrange.getState().order).toEqual([8, 6, 5, 4, 3, 1, 7, 2]);
    store.markSaved(useRearrange.getState().order);
    expect(useApp.getState().dirtyWorkspaces.rearrange).toBe(false);
    store.reset();
    expect(useApp.getState().dirtyWorkspaces.rearrange).toBe(true);
    store.undo();
    expect(useApp.getState().dirtyWorkspaces.rearrange).toBe(false);
    store.reverse();
    store.discard();
    expect(
      sameOrder(
        useRearrange.getState().order,
        useRearrange.getState().savedOrder,
      ),
    ).toBe(true);
  });
});

const binary = path.resolve("resources/binaries/qpdf/bin/qpdf.exe");
let temp: string, source: string, sourceHash: string;
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "paperin-rearrange-test-"));
  source = path.join(temp, "Catatan kegiatan 日本語.pdf");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 8; i++) {
    const page = pdf.addPage(i % 2 ? [595, 842] : [842, 595]);
    page.drawText(`Unique page ${i}`, { x: 40, y: 400, font });
    page.drawRectangle({
      x: 20 * i,
      y: 50,
      width: 50,
      height: 40,
      color: rgb(i / 10, 0.1, 0.3),
    });
    if (i === 4) page.setRotation(degrees(90));
  }
  const image = await pdf.embedPng(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  pdf.getPage(0).drawImage(image, { x: 50, y: 50, width: 100, height: 100 });
  const form = pdf.getForm().createTextField("name");
  form.setText("A form value");
  form.addToPage(pdf.getPage(1), { x: 50, y: 50, width: 120, height: 25 });
  pdf.catalog.set(
    PDFName.of("PageLabels"),
    pdf.context.obj({ Nums: [0, { S: PDFName.of("r") }] }),
  );
  const outline = pdf.context.obj({ Type: "Outlines", Count: 1 });
  const outlineRef = pdf.context.register(outline);
  const item = pdf.context.obj({
    Title: pdf.context.obj("Chapter"),
    Parent: outlineRef,
    Dest: [pdf.getPage(2).ref, PDFName.of("Fit")],
  });
  const itemRef = pdf.context.register(item);
  outline.set(PDFName.of("First"), itemRef);
  outline.set(PDFName.of("Last"), itemRef);
  pdf.catalog.set(PDFName.of("Outlines"), outlineRef);
  await fs.writeFile(source, await pdf.save());
  sourceHash = hash(await fs.readFile(source));
});
afterAll(async () => {
  if (source) expect(hash(await fs.readFile(source))).toBe(sourceHash);
  if (temp && path.basename(temp).startsWith("paperin-rearrange-test-"))
    await fs.rm(temp, { recursive: true, force: true });
});
async function workspace() {
  return fs.mkdtemp(path.join(temp, "job-"));
}
describe("structural qpdf rearrangement", () => {
  it("verifies every page, retains mixed sizes, vector/image streams, forms, labels and bookmarks", async () => {
    const directory = await workspace();
    const snapshot = await snapshotSource(
      binary,
      { path: source, hash: sourceHash },
      directory,
    );
    const dest = path.join(directory, "output.pdf");
    const order = [1, 3, 5, 7, 8, 2, 4, 6];
    const before = await generateRearranged(
      binary,
      snapshot,
      order,
      dest,
      undefined,
      inspectRearrange,
    );
    const after = await inspectRearrange(dest);
    expect(after.fingerprints).toEqual(
      order.map((id) => before.fingerprints[id - 1]),
    );
    expect(before.warnings).toHaveLength(3);
    const pdf = await PDFDocument.load(await fs.readFile(dest));
    expect(pdf.catalog.has(PDFName.of("Outlines"))).toBe(true);
    expect(pdf.getForm().getTextField("name").getText()).toBe("A form value");
    expect(pdf.getPage(6).getRotation().angle).toBe(90);
    expect(pdf.getPage(4).getWidth()).toBe(842);
  });
  it("detects a wrong order even when page count is identical", async () => {
    const directory = await workspace();
    const snapshot = await snapshotSource(binary, { path: source }, directory);
    let calls = 0;
    await expect(
      generateRearranged(
        binary,
        snapshot,
        originalOrder(8).reverse(),
        path.join(directory, "bad.pdf"),
        undefined,
        async (location) => {
          const inspected = await inspectRearrange(location);
          if (++calls === 2) inspected.fingerprints.reverse();
          return inspected;
        },
      ),
    ).rejects.toThrow("order couldn't be verified");
  });
  it("blocks digital signatures, including nested direct dictionaries", async () => {
    const pdf = await PDFDocument.load(await fs.readFile(source));
    pdf.catalog.set(
      PDFName.of("Perms"),
      pdf.context.obj({ DocMDP: { Type: "Sig", ByteRange: [0, 10, 20, 30] } }),
    );
    const signed = path.join(temp, "signed.pdf");
    await fs.writeFile(signed, await pdf.save());
    expect((await inspectRearrange(signed)).blocked).toContain(
      "digital signature",
    );
  });
  it("rejects changed sources, duplicates and a missing password", async () => {
    await expect(
      snapshotSource(
        binary,
        { path: source, hash: "changed" },
        await workspace(),
      ),
    ).rejects.toThrow("changed on disk");
    const snapshot = await snapshotSource(
      binary,
      { path: source },
      await workspace(),
    );
    await expect(
      generateRearranged(
        binary,
        snapshot,
        [1, 1, 3, 4, 5, 6, 7, 8],
        path.join(temp, "invalid.pdf"),
        undefined,
        inspectRearrange,
      ),
    ).rejects.toThrow("invalid");
    const encrypted = path.join(temp, "encrypted.pdf");
    await runQpdf(binary, [
      source,
      "--encrypt",
      "reader",
      "owner",
      "256",
      "--",
      encrypted,
    ]);
    await expect(
      snapshotSource(binary, { path: encrypted }, await workspace()),
    ).rejects.toThrow("password");
    const protectedSource = await snapshotSource(
      binary,
      { path: encrypted, password: "reader" },
      await workspace(),
    );
    const output = path.join(
      path.dirname(protectedSource.snapshot),
      "protected-output.pdf",
    );
    await generateRearranged(
      binary,
      protectedSource,
      originalOrder(8).reverse(),
      output,
      undefined,
      inspectRearrange,
    );
    const encryptedInfo = JSON.parse(
      await runQpdf(binary, [
        "--password=reader",
        "--json",
        "--json-key=encrypt",
        output,
      ]),
    );
    expect(encryptedInfo.encrypt.encrypted).toBe(true);
    const restricted = path.join(temp, "restricted.pdf");
    await runQpdf(binary, [
      source,
      "--encrypt",
      "reader",
      "owner",
      "256",
      "--modify=none",
      "--",
      restricted,
    ]);
    await expect(
      snapshotSource(
        binary,
        { path: restricted, password: "reader" },
        await workspace(),
      ),
    ).rejects.toThrow("doesn't allow");
  });
  it("cancels native processing", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      runQpdf(binary, ["--check", source], abort.signal),
    ).rejects.toThrow("cancelled");
  });
});
