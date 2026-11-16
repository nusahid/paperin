import { z } from "zod";

export const MAX_PNG_BYTES = 15 * 1024 * 1024;
export const MAX_PNG_PIXELS = 16_000_000;
export const MAX_SESSION_IMAGES = 8;
export type SignatureImage = {
  id: string;
  name: string;
  mimeType: "image/png";
  widthPx: number;
  heightPx: number;
  bytes: Uint8Array;
};
export const placementSchema = z
  .object({
    id: z.string().uuid(),
    imageId: z.string().uuid(),
    pageIndex: z.number().int().nonnegative(),
    // Origin is the image's bottom-left in PDF user space. Width and height
    // follow the displayed page axes; page /Rotate is applied only on export.
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive().max(1_000_000),
    height: z.number().finite().positive().max(1_000_000),
    opacity: z.literal(1),
    rotation: z.literal(0),
  })
  .strict();
export type SignaturePlacement = z.infer<typeof placementSchema>;
export const signatureExportSchema = z
  .object({
    sessionId: z.string().uuid(),
    placements: z
      .array(placementSchema)
      .min(1, "Add a signature before saving.")
      .max(1000),
  })
  .strict();
export type SignatureExport = z.infer<typeof signatureExportSchema>;
