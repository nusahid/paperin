# Paperin user guide

[Download and installation](INSTALLATION.md) · [Back to README](../README.md)

The main workspaces are **Home**, **Reader**, **Merge**, and **Split**. Button names below match the English app interface.

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
- Wait for the export to finish. Cancellation after processing begins is not currently available.
- If a multi-file export fails partway through saving, check the app message and destination folder. Files already saved may remain there.
- Page operations can affect bookmarks, forms, attachments, and digital signature validity. Review documents that use these features.
- Save your work before closing the app. Recent-file history and editing sessions are not restored as a project after the app closes.
