import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  defaultImageOptions,
  imageLayout,
  inspectImage,
  MAX_PIXELS,
  rasterSize,
  conversionPlanSchema,
} from "../src/shared/conversion";

describe("conversion layout shared by preview and export", () => {
  it("fits the entire image inside A4 margins and follows visual orientation", () => {
    const l = imageLayout(1200, 800, defaultImageOptions);
    expect(l.pageWidth).toBeCloseTo(841.89, 1);
    expect(l.pageHeight).toBeCloseTo(595.28, 1);
    expect(l.drawWidth / l.drawHeight).toBeCloseTo(1.5);
    expect(l.x).toBeGreaterThanOrEqual(l.margin);
    expect(l.y).toBeGreaterThanOrEqual(l.margin);
    expect(l.x + l.drawWidth).toBeLessThanOrEqual(
      l.pageWidth - l.margin + 0.001,
    );
    const square = imageLayout(800, 800, defaultImageOptions);
    expect(square.pageHeight).toBeGreaterThan(square.pageWidth);
  });
  it("crops cover centrally, allows explicit distortion, and bounds physical image-ratio pages", () => {
    const options = {
      ...defaultImageOptions,
      orientation: "portrait" as const,
    };
    const contain = imageLayout(1600, 400, options);
    const cover = imageLayout(1600, 400, { ...options, fitting: "cover" });
    expect(contain.drawHeight).toBeLessThan(contain.areaHeight);
    expect(cover.x).toBeLessThan(cover.margin);
    expect(cover.drawHeight).toBeCloseTo(cover.areaHeight);
    expect((cover.pageWidth - cover.drawWidth) / 2).toBeCloseTo(cover.x);
    const stretch = imageLayout(1600, 400, { ...options, fitting: "stretch" });
    expect(stretch.drawWidth).toBe(stretch.areaWidth);
    expect(stretch.drawHeight).toBe(stretch.areaHeight);
    const match = imageLayout(8000, 4000, {
      ...options,
      pageSize: "MATCH_IMAGE",
      orientation: "auto",
      marginMm: 0,
    });
    expect(match.pageWidth / match.pageHeight).toBe(2);
    expect(match.pageWidth).toBeLessThan(600);
    expect(() =>
      imageLayout(10000, 1, { ...options, pageSize: "MATCH_IMAGE" }),
    ).toThrow("margins");
  });
});
describe("raster validation and resource protection", () => {
  it("uses physical page dimensions independent of Reader zoom", () => {
    expect(rasterSize(595.28, 841.89, 300)).toEqual({
      width: 2481,
      height: 3508,
    });
    expect(() => rasterSize(14400, 14400, 300)).toThrow("resolution");
  });
  it("checks signatures and dimensions before decoding", () => {
    const bytes = PNG.sync.write(new PNG({ width: 30, height: 40 }));
    expect(inspectImage(bytes)).toEqual({
      width: 30,
      height: 40,
      mimeType: "image/png",
    });
    expect(() => inspectImage(Buffer.from("fake image"))).toThrow("opened");
    const bomb = Buffer.from(bytes);
    bomb.writeUInt32BE(MAX_PIXELS, 16);
    expect(() => inspectImage(bomb)).toThrow("megapixel");
  });
  it("rejects unsupported or excessive conversion settings at the IPC boundary", () => {
    expect(
      conversionPlanSchema.safeParse({
        type: "pdf-to-image",
        sourceId: crypto.randomUUID(),
        pages: [0],
        format: "png",
        dpi: 600,
        quality: 1,
      }).success,
    ).toBe(false);
    expect(
      conversionPlanSchema.safeParse({
        type: "image-to-pdf",
        imageIds: [],
        options: defaultImageOptions,
      }).success,
    ).toBe(false);
  });
});
