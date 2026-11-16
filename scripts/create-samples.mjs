import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";
const document = await PDFDocument.create();
const regular = await document.embedFont(StandardFonts.Helvetica);
const bold = await document.embedFont(StandardFonts.HelveticaBold);
const blue = rgb(0.14, 0.36, 0.89),
  ink = rgb(0.12, 0.17, 0.26),
  muted = rgb(0.49, 0.55, 0.65),
  line = rgb(0.88, 0.91, 0.95);
const titles = [
  "A little room\nto think.",
  "Less noise.\nMore clarity.",
  "One place for\nevery page.",
  "Bring the pieces\ntogether.",
  "Keep what\nmatters.",
  "A calmer\nworkflow.",
  "Private\nby nature.",
  "Make it\nyour own.",
];
const paras = [
  [
    "A small guide to a simpler document workflow.",
    "Open. Read. Organize. Save.",
  ],
  [
    "A good workspace gives your attention somewhere to settle. It makes the next step obvious, and lets everything else fade into the background.",
    "Begin with a single document. Read slowly. Find the pages that matter to you, and leave the rest for another day.",
  ],
  [
    "Your documents tell a story. A proposal, a set of notes, a report: each page is part of something you are working toward.",
    "Use the page thumbnails to see the shape of a document. Jump to a chapter, search for a phrase, or zoom in for a closer look.",
  ],
  [
    "Some ideas belong together. Gather a few PDFs, arrange their order, and make one complete document that is easy to share or keep.",
    "In the Merge workspace, the order of the files is the order of your final PDF. Preview the pages before saving a new copy.",
  ],
  [
    "You do not always need the whole document. Sometimes a chapter, a reference, or a handful of pages is just enough.",
    "Choose the pages you need in Split. Extract one selection, divide the document by ranges, or create a new file without selected pages.",
  ],
  [
    "Small, predictable steps are often the most useful. Open a document. Check its pages. Choose what comes next. Save the result.",
    "Your original files remain just as they were. Every merge or split creates a new document, giving you space to work with confidence.",
  ],
  [
    "Some things are better kept close. Your documents are processed on your computer, without accounts, uploads, or cloud services.",
    "Paperin works without an internet connection. Your files stay on your device, from the first page you open to the last PDF you save.",
  ],
  [
    "This sample is yours to explore. Try searching for a word, extracting a few pages, or combining it with another PDF.",
    "A little less paperwork. A little more peace of mind.",
  ],
];
function wrap(text, font, size, max) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
for (let i = 0; i < 8; i++) {
  const p = document.addPage([595.28, 841.89]);
  p.drawText("PAPERIN   /   A FIELD GUIDE", {
    x: 56,
    y: 784,
    size: 8,
    font: bold,
    color: blue,
  });
  p.drawLine({
    start: { x: 56, y: 765 },
    end: { x: 539, y: 765 },
    thickness: 0.6,
    color: line,
  });
  let y = 666;
  for (const title of titles[i].split("\n")) {
    p.drawText(title, { x: 56, y, size: 43, font: bold, color: ink });
    y -= 53;
  }
  p.drawRectangle({ x: 56, y: y - 4, width: 42, height: 3, color: blue });
  y -= 65;
  for (const para of paras[i]) {
    for (const text of wrap(para, regular, 12, 455)) {
      p.drawText(text, { x: 56, y, size: 12, font: regular, color: muted });
      y -= 23;
    }
    y -= 21;
  }
  if (i === 0) {
    p.drawRectangle({
      x: 56,
      y: 168,
      width: 483,
      height: 104,
      color: rgb(0.95, 0.97, 1),
    });
    p.drawText("A FEW PAGES. A FRESH START.", {
      x: 77,
      y: 236,
      size: 9,
      font: bold,
      color: blue,
    });
    p.drawText("Your documents, right where they belong.", {
      x: 77,
      y: 207,
      size: 12,
      font: regular,
      color: muted,
    });
  }
  if (i === 5) {
    for (let b = 0; b < 6; b++)
      p.drawRectangle({
        x: 66 + b * 73,
        y: 175,
        width: 47,
        height: 35 + b * 18,
        color: rgb(0.3 + b * 0.04, 0.5 + b * 0.035, 0.9),
      });
  }
  p.drawLine({
    start: { x: 56, y: 64 },
    end: { x: 539, y: 64 },
    thickness: 0.6,
    color: line,
  });
  p.drawText("A LITTLE ROOM TO THINK", {
    x: 56,
    y: 44,
    size: 7,
    font: regular,
    color: muted,
  });
  p.drawText(String(i + 1).padStart(2, "0"), {
    x: 526,
    y: 44,
    size: 8,
    font: bold,
    color: blue,
  });
}
document.setTitle("A little room to think");
document.setAuthor("Paperin");
await fs.mkdir(path.resolve("resources/samples"), { recursive: true });
await fs.writeFile(
  path.resolve("resources/samples/A little room to think.pdf"),
  await document.save(),
);
console.log("Created the local 8-page sample PDF.");
