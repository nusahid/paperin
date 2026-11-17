# Implementasi Folio Converter / F-CONVERT

Spesifikasi Folio Converter diterapkan pada aplikasi yang saat ini bernama **Paperin**. Modul mengikuti navigasi dan komponen aplikasi yang sudah ada. Tidak ada perubahan nama produk, dependency runtime baru, ataupun layanan jaringan.

## Fitur yang tersedia

- Convert landing dengan Image to PDF dan PDF to Image; drag-and-drop gambar/PDF serta pemilihan jenis konversi untuk campuran file.
- Import JPG/JPEG/PNG bertahap, thumbnail, dimensi, ukuran file, penambahan gambar, pengurutan dengan drag atau tombol, rotasi, pemilihan dan penghapusan massal.
- A4, A5, Letter, Legal, Match Image Ratio; orientasi Auto/Portrait/Landscape; Contain/Cover dan Stretch pada Advanced settings; margin 0/5/10/20 mm serta latar putih.
- Koreksi orientasi EXIF melalui Chromium sebelum rotasi pengguna. Preview komposisi dan pdf-lib memakai fungsi layout yang sama, termasuk clipping untuk Cover.
- PDF.js dari Reader dipakai kembali; dokumen berpassword mengikuti dialog password yang ada. Tombol Reader mempertahankan halaman aktif ketika masuk ke converter.
- Pemilihan All/Current/Selected/Custom Range menggunakan parser Split, dengan deduplikasi dan urutan naik saat ekspor.
- JPG/PNG, 72/150/200/300 DPI, preset dan slider JPEG quality. Preview PDF merender dan mengenkode memakai parameter ekspor, terpisah dari zoom Reader.
- Save As untuk satu hasil, folder untuk beberapa gambar; Keep Both/Replace/Cancel, progress per item, pembatalan, dan status hasil parsial.

## Arsitektur dan pengamanan

`shared/conversion.ts` memuat kontrak Zod, resource limit, inspeksi signature/dimensi, kalkulasi layout, dan kalkulasi raster. State controller menggunakan Zustand. Renderer hanya menerima ID file terdaftar; API preload tidak mengekspos filesystem umum.

Main process menangani dialog, registrasi, pemeriksaan hash sumber, sesi ekspor tunggal, validasi payload dan penyimpanan. Seluruh endpoint memakai pemeriksaan identitas sender yang sudah ada. Jumlah halaman PDF diverifikasi kembali dengan qpdf sebelum job dimulai.

Decoding memakai Chromium dengan orientasi EXIF. Gambar dinormalisasi tanpa mengubah sumber; penyusunan dan validasi PDF serta validasi PNG berjalan pada worker thread. PDF.js memakai worker lokal; rendering dan encoding canvas berlangsung berurutan, satu halaman per proses. Bitmap, canvas, object URL, dan worker dibersihkan setelah digunakan.

Output ditulis dahulu ke staging bertanda milik aplikasi. PDF dibuka ulang dan jumlah halaman diperiksa; JPG/PNG diperiksa signature, dimensi, format dan byte yang tidak kosong. PNG juga didekode pada worker. Pemindahan hasil baru menolak benturan nama yang muncul setelah dialog; penggantian hasil lama hanya mengikuti pilihan Replace. Startup recovery memakai jurnal staging aplikasi yang sudah tersedia. Ekspor multi-file mempertahankan hasil yang sudah selesai ketika gagal atau dibatalkan.

## Batas sumber daya

- Maksimum 40 megapiksel per bitmap, maksimal 32.767 piksel per dimensi.
- Maksimum input gambar 128 MB dan total input/normalisasi 512 MB per batch.
- Pemeriksaan memori kosong sebelum job dan setiap item, satu job aktif, satu render ekspor aktif, batas heap worker 1 GB.
- Pembacaan gambar dibatasi ukuran snapshot; pertumbuhan file selama pembacaan ditolak.
- Batas waktu worker 120 detik per permintaan dan penghentian sesi yang tidak aktif selama 180 detik.

Batas ini merupakan pengamanan awal, bukan janji kapasitas maksimum semua perangkat. Normalisasi gambar dapat memperbesar data di memori dan ukuran PDF. Penghapusan seluruh metadata tidak dijanjikan.

## Verifikasi

Unit test mencakup layout, fitting, orientasi, margin, dimensi raster, signature, resource limit, serta validasi kontrak IPC. Pengujian Electron menggunakan file JPG, PNG transparan, JPEG EXIF, dan PDF dengan halaman berotasi; memeriksa hasil aktual, bukan hanya notifikasi UI.

Skenario integrasi mencakup urutan gambar, rotasi, preview, ekspor PDF/JPG/PNG, rentang tidak valid/duplikat, dimensi berdasarkan DPI, Keep Both, perlindungan sumber, pembatalan dan hasil parsial, kegagalan ENOSPC, batch lebih dari 100 gambar, Reader handoff, dan tampilan 900 × 600. Session Electron dipaksa offline dan permintaan HTTP(S) dicatat. Smoke test aplikasi paket mencakup worker konversi dalam ASAR dan ekspor PNG.

Hasil verifikasi lokal pada 17 November 2026:

- `npm run typecheck`, `npm run format:check`, dan `git diff --check`: lulus.
- `npm test`: 38 pengujian unit lulus.
- `npx playwright test --max-failures=1`: 17 skenario regresi lulus. Satu skenario tambahan untuk konversi PDF berpassword dan halaman aktif Reader dijalankan terpisah dan lulus; total 18 skenario yang diverifikasi.
- `npm run make`: build aplikasi dan installer Windows x64 berhasil. Installer tersedia di `dist/make/squirrel.windows/x64/Paperin-Setup.exe`.
- `npm run test:package`: Reader, Signature, qpdf, worker Image to PDF, dan PDF to PNG pada aplikasi paket lulus secara offline.

Target waktu pada Windows 11/RAM 8 GB/SSD, profiling memori untuk gambar 40 MP, seluruh variasi EXIF/CropBox, kegagalan perangkat fisik, serta pengalaman installer pada mesin bersih masih memerlukan pengujian rilis terpisah. Hasil fixture kecil atau batch gambar kecil tidak membuktikan target performa untuk dokumen kompleks.

ZIP, kompresi PDF, multi-PDF batch, WebP dan OCR mengikuti prioritas lanjutan pada PRD dan belum disediakan.
