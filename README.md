# Folio

A local Windows PDF workspace, built from the supplied Folio PRD and UI reference. Electron, React, TypeScript, Vite, PDF.js, qpdf, Zustand, Zod, and Lucide. Fonts, workers, PDF rendering resources, and the native PDF engine are bundled locally.

## Run

Requires **Windows x64** and **Node.js 22.13+** (or Node.js 24+). Internet is needed for initial dependency and engine setup only.

```powershell
npm ci
npm run setup:qpdf
npm run dev
```

To run the production build:

```powershell
npm run build
npm start
```

The sample document and PDF.js assets are generated/copied during `npm ci`. The qpdf setup script downloads the pinned official **12.4.2** Windows release and verifies its SHA-256 checksum. Runtime requires no external services or downloads.

## Included

- **Home:** file picker, native Explorer drag-and-drop, three workspaces, and an original eight-page sample.
- **Reader:** continuous scrolling, lazy page rendering, page/thumbnail navigation, fit page/width, 25–300% zoom, selectable/copyable text, and text search with matching-page navigation. Image-only PDFs do not become searchable without OCR.
- **Add Signature (F-16):** an editor inside Reader with validated local PNG import, transparent preview, click-to-place, drag, four corner resize handles, aspect ratio lock, point-based size inputs, keyboard positioning, multiple pages/placements, remove, and 50-action undo/redo. Save As embeds the PNG using pdf-lib and validates a temporary PDF with qpdf before committing it. PDF text and page content remain vector content.
- **Merge:** multiple input files, first-page thumbnails, drag and keyboard reorder, removal, page totals, output naming, and visual preview.
- **Split:** visual page selection, all/none/odd/even, explicit ordered ranges, extract, remove, separate ranges, and every-N-page output.
- **Export:** native Save As or folder selection, overwrite confirmation, qpdf processing outside the renderer, staged validation, page-count verification, replacement only after validation, and startup cleanup of owned staging files.
- **Privacy:** no login, telemetry, cloud, CDN, or automatic update checks. Remote requests are blocked in the production Electron session. Source files cannot be selected as output, including aliases/hard links.
- **Protected documents:** PDF.js requests the password. qpdf receives it only in memory/process arguments for this session; passwords are never persisted. Signature, form, and attachment warnings are shown before page operations.
- **Accessibility:** focus states, native controls, dialog focus management, icon labels, reduced-motion support, and keyboard shortcuts.

## Build a Windows application / installer

```powershell
npm run package
npm run make
```

The unpacked application is created under `dist/Folio-win32-x64/`. Run `Folio.exe` from that folder; keep the accompanying resources together. The Squirrel installer is written under `dist/make/squirrel.windows/x64/`. qpdf, its supporting DLLs/documentation, icons, and the sample are copied into packaged resources. The installer is unsigned; public distribution should include code signing and testing on a clean Windows machine.

The verified F-16 build is also available at `dist/signature/Folio-win32-x64/Folio.exe`. It was packaged separately because the original executable was running. Its offline smoke test passed PNG import, signature placement, the packaged worker, signed PDF export, PDF.js text rendering, and qpdf page export. To check this build again, set `FOLIO_SMOKE_EXECUTABLE` to that executable path before running `npm run test:package`. No new installer was generated for F-16.

## Verify

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run test:package # after npm run package / npm run make
npm audit
```

The unit/integration suite runs the real bundled qpdf, checks merge/extract/split composition, validates encrypted input, and hashes source PDFs to check that they remain unchanged. Electron E2E tests use real local PDFs and processing with network emulation set offline; native dialog return values are stubbed so exports go to temporary test folders. Screenshots are saved under `test-results/screenshots/`.

Local verification: **33 unit/integration tests** and **9 Electron E2E tests** cover the reader, page operations, and signature editor. Signature checks compare actual PDF.js-rendered output with the preview composite for all four page rotations, offset CropBoxes, alpha transparency, and PDF UserUnit values of 1 and 2. They also check text preservation, multiple pages, drag history, keyboard movement across zoom levels, PNG rejection, replacement history, cancel/release, protected inputs, and preservation of existing output on failure. The suite also checks sandbox settings, canceled export, source-file protection, and lazy rendering/navigation in a 200-page document. Native dialogs are stubbed in E2E tests; performance targets and clean-machine installer certification require separate testing.

Shortcuts: `Ctrl+O` opens a document, `Ctrl+F` searches in Reader, left/right or Page Up/Page Down navigate, Tab moves focus, and Escape closes a dialog.

In Signature Mode, `Ctrl+Z` undoes, `Ctrl+Shift+Z` redoes, `Ctrl+S` opens Save As, Delete removes the selected placement, and Escape cancels placement or deselects. Arrow keys move a selected signature by one physical PDF point (Shift: ten points), independent of zoom. Use **Cancel** to clear signature images and editing history; unsaved placements require confirmation. Switching workspaces retains the editing session in memory.

Choose **Reader → Add Signature → Choose PNG → Place Signature**, click a page, then **Save As**. The suggested output is `[original_name]_signed.pdf`; original documents cannot be overwritten, including aliases and hard links. Signatures are visual images, with no identity verification or certified integrity. This MVP blocks encrypted PDFs even when opened with a password, existing digital signatures, and conservatively any signature form fields. It supports still PNGs up to 15 MB, 16 million pixels and 16,384 pixels per dimension; a session accepts up to eight imports and 32 million total image pixels. Images, paths, and history are not saved to localStorage, a signature library, or a cloud service. Canceling the editor, opening another PDF after confirmation, or exiting the application releases the session.

## Implementation notes and limits

- `src/main`: file capabilities, validated IPC, offline protocol, qpdf engine, safe export, recovery, and a worker for signature validation/PDF writing.
- `src/preload`: a narrow typed API; Node.js and raw Electron objects are not exposed.
- `src/renderer`: React workspaces, reusable lazy PDF page component, preview, and local state.
- `src/shared`: export types, signature schemas, viewport coordinate helpers, and deterministic page composition shared by preview and export.
- `resources`: bundled qpdf, generated sample, app icons, and notices.

The current import limit is **512 MB per PDF**. PDF objects remain in memory for the session. Export is non-cancellable once processing begins; an individual engine invocation times out after two minutes. If a multi-file export fails while final files are being committed, already saved files are reported accurately and can remain in the destination. Manipulating pages can alter document-level features, bookmarks, forms, attachments, and signature validity. No signature validity is promised. macOS/Linux binaries, OCR, annotations, printing, and recent-file history are outside this implementation.

The PRD's startup, 20 MB rendering, and 200-page performance targets still need representative hardware benchmarking. Automated offline tests cover application requests; they are not an operating-system packet capture or a clean-machine installer certification.

The signature PRD's import, drag/resize frame-rate, and 10-page export latency targets still need measurement on the reference SSD / 8 GB RAM device.

The development server uses localhost and WebSocket HMR. The packaged app uses `folio://app`, an isolated sandboxed renderer, denied permission requests, blocked navigation/window creation, and no external network access.
