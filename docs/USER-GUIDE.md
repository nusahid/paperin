# Paperin user guide

[Download and installation](INSTALLATION.md) · [Back to README](../README.md)

The main workspaces are **Home**, **Reader**, **Merge**, **Split**, **Rearrange**, and **Convert**. Button names below match the English app interface.

## Open a document

1. On **Home**, click **Browse files** and select one or more PDFs. You can also drag files from File Explorer into the app window.
2. Use **Reader** to read an opened PDF.
3. To explore the app without a personal document, click **Try a sample PDF** on Home.

The maximum file size is 512 MB per PDF. If a document is password-protected, the app asks for its password. Passwords are not saved as preferences for future sessions.

## Read and search for text

1. Open a PDF in **Reader**.
2. Scroll through the document or select a thumbnail to navigate pages.
3. Use the zoom controls, **Fit page**, or **Fit width** to adjust the view.
4. Press **Ctrl+F**, enter your search text, and use the search navigation controls to move between matching pages.
5. Available PDF text can be selected and copied.

Search does not recognize text in scanned images because OCR is not currently available.

## Merge multiple PDFs

1. Open **Merge** and click **Add files** to add PDFs.
2. Arrange documents by dragging file rows or using the up/down arrow buttons.
3. Remove files you do not need using the remove control.
4. Enter an **Output file name**.
5. Click **Preview output** to check the page order.
6. Click **Merge & save**, choose a destination, and wait for the export result.

The file list determines the document order in the merged PDF. Original files remain unchanged.

## Extract or split pages

Open **Split** and select the PDF you want to process. Choose a mode:

| Mode                       | Example                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| **Extract selected pages** | Select pages 1, 3, and 5 to create one PDF containing those pages.                      |
| **Remove selected pages**  | Select pages to remove. The output is a new PDF containing the remaining pages.         |
| **Split by ranges**        | Enter `1-3; 4-6; 7-10` to create three separate PDFs.                                   |
| **Split every N pages**    | Enter `2` to create one PDF for every two pages. The last part may contain fewer pages. |

For page selection modes, click thumbnails or use the all, none, odd, and even selection controls. The selection range field accepts input such as `1-3, 5, 7`; click **Apply range** to apply it.

Enter a filename or output name prefix, click **Preview output**, then use the save button for your mode: **Extract & save**, **Remove & save**, or **Split & save**. For multiple output files, the app asks you to choose a destination folder.

## Rearrange PDF pages

1. Open **Rearrange** from the sidebar or the **Rearrange Pages** card on Home, then choose one PDF or drop it into the workspace. In Reader, **Rearrange Pages** reuses the active document.
2. Drag a thumbnail before or after another page. The blue insertion line marks the destination. Ctrl+click toggles individual selections; Shift+click selects a range in the displayed order. Dragging a selected thumbnail moves the entire selection in its displayed order. The grid scrolls automatically near its top and bottom edges.
3. Use **Reverse Pages** to reverse the current order. **Undo**, **Redo**, and **Reset Order** also work in memory. History holds up to 50 changes.
4. Each card shows its new position and its original page number. Double-click a card, or use **Preview**, to read pages in the new order.
5. Click **Save As**. The suggested name is `[original_name]_reordered.pdf`. Wait for the success message; use **Open file** to inspect the result. **Cancel saving** discards unfinished output. Your source stays unchanged.

When the grid has focus, arrows navigate thumbnails, Space toggles selection, Ctrl+A selects all, Escape clears selection or cancels a drag, and Enter previews the focused page. Alt+Left/Up moves the selection one position earlier; Alt+Right/Down moves it later. Ctrl+Z undoes; Ctrl+Shift+Z or Ctrl+Y redoes. Input fields and other workspaces keep their own shortcuts.

Rearrange preserves page content without converting it to images. It blocks digital signatures and signature fields. Password-protected documents require a valid password and permission to assemble pages; their output remains encrypted. Warnings identify bookmarks, custom page labels, and interactive forms that need review. Leaving with unsaved changes asks whether to keep editing or discard changes back to the last saved order. Sessions are kept only in memory.

## Add a signature image

1. Open a PDF in **Reader**, then click **Add Signature**.
2. Click **Choose PNG** and select a static PNG image. Transparent backgrounds are supported.
3. Click **Place Signature**, then click a location on a PDF page.
4. Drag the image to reposition it. Drag a corner handle to resize it, or use the size fields in the editor panel.
5. Add more placements if needed, including placements on other pages.
6. Click **Save As**, choose a new PDF filename and location, and wait for confirmation. The suggested name is `[original_name]_signed.pdf`.
7. Use **Cancel** to end the editor session and clear its images and editing history. The app asks for confirmation if there are unsaved placements.

Each image is limited to 15 MB, 16 million pixels, and 16,384 pixels per dimension. A session accepts up to eight imports and 32 million image pixels in total.

**A signature image does not verify the signer's identity and is not a certificate-based digital signature.** The editor rejects encrypted PDFs, PDFs with existing digital signatures, and PDFs with signature form fields. Use an appropriate signing application if you require certificates or identity verification.

## Convert images to PDF

1. Open **Convert**, choose **Image to PDF**, and select JPG/PNG files. Dropping images into the app opens this workspace too.
2. Use **Add Images** to append more. Drag cards or use their arrow buttons to reorder; use rotate and remove controls as needed. Checkboxes support removing several images together.
3. Review page size, orientation, fitting, and margins. Defaults are A4, Auto, Contain, 10 mm, and a white background. Stretch is under **Advanced settings** and can distort proportions.
4. Click **Preview** to inspect pages, then **Create PDF** and choose a filename. Use **Open PDF** or **Show in Folder** after completion.

Phone-image orientation is applied before user rotation. Source images are unchanged. Match Image Ratio bounds the longest page edge to about 210 mm; choose smaller margins for very narrow images.

## Convert PDF pages to images

1. Open **Convert → PDF to Image**, or use **Convert PDF to images** in Reader to reuse the open document and current page.
2. Select **All Pages**, **Current Page**, **Selected Pages**, or **Custom Range**. Ranges accept `1-3, 5, 9-12`; duplicates are removed and pages export in source order. Click a thumbnail to change the current page; use its checkbox to change the selection.
3. Choose JPG or PNG, then a resolution of 72, 150, 200, or 300 DPI. JPEG quality appears only for JPG. Reader zoom does not affect export resolution.
4. Click **Preview** to inspect the encoded output, then **Convert**. One page uses Save As; multiple pages use a folder picker and names such as `Report_page_001.png`.

At narrow window widths, open **Settings** at the top of the conversion workspace to access export controls. If a filename already exists, choose **Keep Both**, **Replace**, or **Cancel**. A second confirmation also covers filenames changed by adding an extension. Source files cannot be replaced.

**Cancel conversion** stops rendering and further processing. Completed image files remain available and the result reports their count; an unfinished single PDF is discarded. Exported images have a white background and do not preserve selectable text, links, bookmarks, forms, or digital signatures.

## Keyboard shortcuts

| Shortcut                             | Action                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `Ctrl+O`                             | Open PDF documents.                                                                        |
| `Ctrl+F`                             | Toggle search in Reader.                                                                   |
| `←` / `→` or `Page Up` / `Page Down` | Navigate Reader pages when focus is outside an input field.                                |
| `Tab`                                | Move focus between controls.                                                               |
| `Escape`                             | Close supported dialogs; in the signature editor, cancel placement or clear the selection. |
| `Ctrl+Z`                             | Undo in the signature editor.                                                              |
| `Ctrl+Shift+Z`                       | Redo in the signature editor.                                                              |
| `Ctrl+S`                             | Open Save As in the signature editor.                                                      |
| `Delete`                             | Remove the selected signature placement.                                                   |
| Arrow keys                           | Move the selected signature by one PDF point; hold `Shift` to move ten points.             |

## Save your results

- Choose a new filename. Source files cannot be overwritten by an operation's output.
- Check the preview before saving and reopen the exported PDF to inspect the result.
- Wait for the export to finish. Converter jobs support **Cancel conversion**, and Rearrange supports **Cancel saving**; Merge, Split, and signature exports must finish once processing begins.
- If a multi-file export fails partway through saving, check the app message and destination folder. Files already saved may remain there.
- Page operations can affect bookmarks, forms, attachments, and digital signature validity. Review documents that use these features.
- Save your work before closing the app. Recent-file history and editing sessions are not restored as a project after the app closes.
