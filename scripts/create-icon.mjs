import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "node:fs/promises";
const canvas = createCanvas(256, 256);
const context = canvas.getContext("2d");
context.drawImage(
  await loadImage(await fs.readFile("resources/icons/folio.svg")),
  0,
  0,
  256,
  256,
);
const png = canvas.toBuffer("image/png");
await fs.writeFile("resources/icons/folio.png", png);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await fs.writeFile("resources/icons/folio.ico", Buffer.concat([header, png]));
console.log("Folio app icons created.");
