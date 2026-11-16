import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import gifenc from "gifenc";

const { GIFEncoder, applyPalette, quantize } = gifenc;

const root = fileURLToPath(new URL("../", import.meta.url));
const icons = path.join(root, "resources/icons");
const font = path.join(
  root,
  "node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
);
if (!GlobalFonts.registerFromPath(font, "Paperin Inter"))
  throw new Error("Unable to load the bundled Inter font.");

const width = 360;
const height = 240;
const frameCount = 48;
const delay = 50;
const canvas = createCanvas(width, height);
const context = canvas.getContext("2d");
const logo = await loadImage(
  await fs.readFile(path.join(icons, "paperin.svg")),
);
const gif = GIFEncoder();
let palette;

for (let frame = 0; frame < frameCount; frame++) {
  context.fillStyle = "#f8f9fc";
  context.fillRect(0, 0, width, height);
  context.drawImage(logo, (width - 68) / 2, 31, 68, 68);

  context.textAlign = "center";
  context.fillStyle = "#1e293b";
  context.font = '600 27px "Paperin Inter"';
  context.fillText("Paperin", width / 2, 136);
  context.fillStyle = "#64748b";
  context.font = '600 12px "Paperin Inter"';
  context.fillText("Getting your PDF workspace ready", width / 2, 161);

  const track = { x: 106, y: 186, width: 148, height: 4 };
  context.fillStyle = "#e1e8f5";
  context.beginPath();
  context.roundRect(track.x, track.y, track.width, track.height, 2);
  context.fill();
  context.save();
  context.clip();
  const segmentWidth = 44;
  const segmentX =
    track.x -
    segmentWidth +
    ((track.width + segmentWidth) * frame) / (frameCount - 1);
  context.fillStyle = "#235ce8";
  context.beginPath();
  context.roundRect(segmentX, track.y, segmentWidth, track.height, 2);
  context.fill();
  context.restore();

  const { data } = context.getImageData(0, 0, width, height);
  // Use one palette for the whole loop to keep text and logo colors stable.
  palette ??= quantize(data, 256);
  gif.writeFrame(applyPalette(data, palette), width, height, {
    ...(frame === 0 ? { palette } : {}),
    delay,
    repeat: 0,
  });
  if (frame === Math.floor(frameCount / 2))
    await fs.writeFile(
      path.join(root, "docs/images/installer.png"),
      canvas.toBuffer("image/png"),
    );
}

gif.finish();
await fs.writeFile(path.join(icons, "paperin-installer.gif"), gif.bytes());
console.log(
  `Paperin installer animation created: ${width}×${height}, ${frameCount} frames, ${(frameCount * delay) / 1000}s loop.`,
);
