# DocuNest - Smart Document Organizer

DocuNest is a web app that helps you keep your documents in one place. You can import files, sort them into categories, add tags and notes, search, preview and download them. Everything runs in your browser. There is no server, no login and no database server.


- Student: `<your name>`
- College: `<your college>`
- Guide: `<your guide's name>`
- Year: `<year>`

## Features

- Import many files at once (with checks for type, empty files, size, duplicates and storage limit)
- Dashboard with total documents, favorites, categories in use and storage used
- Storage by file type: how many files of each type and how much space they use
- Categories: Education, Certificates, Personal, Work, Finance, Other
- Favorites, tags and notes for every document
- Rename (only the display name changes, never the file)
- Search by name, extension, category, tags and notes
- Category filters with counts, a Favorites view and a Recent view
- Preview for PDF, images, text, Markdown, Word (DOCX) and Excel (XLSX) files
- Download of the original file
- Delete with a confirmation
- Backup and restore of document details (JSON file)
- Responsive layout for laptop, tablet and mobile

## Technologies

| Part | Used for |
|---|---|
| HTML5, CSS3, JavaScript (ES6+) | The app itself |
| Bootstrap 5.3.3 and Bootstrap Icons 1.11.3 | Layout and icons |
| IndexedDB | Saving the files and their details in the browser |
| PDF.js 3.11.174 | PDF preview |
| mammoth 1.6.0 | Word (DOCX) preview |
| marked 4.3.0 and DOMPurify 3.0.6 | Markdown preview and cleaning of untrusted content |
| SheetJS 0.20.3 | Excel (XLSX) preview |

The libraries are loaded from a CDN, so the first use needs an internet connection. The preview libraries for Word, Markdown and Excel are loaded only when you preview that kind of file.

There is no React, no backend, no Node.js and no paid service.

## How to run

1. Install Visual Studio Code.
2. Install the **Live Server** extension (by Ritwick Dey).
3. Open the `DocuNest` folder in VS Code (File, Open Folder).
4. Open `index.html`, then click **Go Live** in the bottom right corner.
5. The app opens in the browser, usually at `http://127.0.0.1:5500`.

Please use Live Server. Opening `index.html` by double click can break the database and the libraries.

Always use the same address. The browser keeps data separately for `127.0.0.1` and `localhost`, so a different address shows an empty app.

## Project structure

```
DocuNest/
├── index.html    page layout, sidebar, popups
├── style.css     design
├── script.js     all the app logic
└── README.md     this file
```

## Supported files

| Type | Extensions | Preview |
|---|---|---|
| PDF | pdf | Yes, page by page |
| Image | png, jpg, jpeg | Yes |
| Text | txt | Yes (first 200,000 characters) |
| Markdown | md | Yes, formatted |
| Word | docx | Yes, simplified (no headers, footers or exact layout) |
| Word (old) | doc | No, download only |
| Excel | xlsx | Yes, as a table (first 200 rows and 30 columns of each sheet) |

## Limits

| Limit | Value |
|---|---|
| One file | 1000 MB |
| All files together | 10000 MB |
| Preview | files up to 50 MB (bigger files can only be downloaded) |

These numbers are set at the top of `script.js` (`MAX_FILE_SIZE`, `MAX_TOTAL_STORAGE`, `MAX_PREVIEW_SIZE`).

The real limit also depends on the browser and on the free space on the disk. A browser can allow less than 10000 MB. The Backup popup shows the browser's own estimate. If the browser runs out of space, DocuNest shows a message and does not save the file.

## How the data is stored

Documents are saved in the browser with IndexedDB (database `DocuNestDB`, version 2):

- `documents` store: the details of each document (name, category, tags, notes, favorite, size, dates)
- `files` store: the real file, with the same id as its document

The two are kept apart so that a small change, like marking a favorite, does not rewrite a big file.

Important:

- The data is stored only in this browser on this computer. It is not stored in the cloud.
- If you clear the browser's site data, the documents are deleted permanently.
- Private (incognito) windows delete the data when they close.
- Keep your original files on your computer. DocuNest keeps copies.

## Backup and restore

Open **Backup** in the sidebar.

- **Export** saves a JSON file with names, categories, tags, notes, favorites, sizes and dates.
- The backup does **not** contain the actual files.
- **Restore** reads such a file and applies the saved details to documents that are already in DocuNest. A backup entry matches a document when the original file name and the file size are the same.
- Restore checks the file format and version, ignores invalid or duplicate entries, and asks for confirmation before it changes anything. It never changes the files themselves.

To recover after losing data: import your original files again, then restore the backup to get your categories, tags, notes and favorites back.

## Adding a new file type

Open `script.js` and add one line to the `FILE_TYPES` list near the top.

```javascript
{ label: "CSV", extensions: ["csv"], icon: "bi-file-earmark-text", preview: "text" },
```

The `preview` value can be:

| Value | What it does |
|---|---|
| `pdf` | PDF viewer |
| `image` | shows the picture |
| `text` | shows plain text |
| `markdown` | shows formatted Markdown |
| `docx` | shows a Word document |
| `xlsx` | shows an Excel sheet |
| `none` | no preview, download only |

The file chooser, the "Supported" text, the icons, the dashboard rows and the warnings update by themselves. A completely new kind of preview needs a new function in `script.js`.

## Safety

- Files are only stored, previewed and downloaded. They are never run.
- Checking the extension does not prove that a file is safe.
- File names, notes and tags are shown with `textContent`, never as HTML.
- Markdown and Word content is cleaned with DOMPurify before it is shown. Scripts, event handlers, `javascript:` links, styles and forms are removed.
- Images from the internet are not loaded in previews, so opening a file does not send a request to another server.
- Excel cells are shown as plain text.
- Documents are never sent to any server. Only the library code is downloaded from a CDN.
- Destructive actions (delete, restore) ask for confirmation.

## Known limitations

- Data lives in one browser only. There is no sync between devices.
- The backup has details only, not the files.
- The Word preview is simplified. The Excel preview shows values only (no colors, charts or formulas).
- Old `.doc` files and `.xls` files are not supported for preview.
- Search works on name, extension, category, tags and notes, not on the text inside files.
- Delete is permanent (there is no trash).
- Very large imports can take time, and the browser's own storage limit may be lower than the DocuNest limit.
- The CDN libraries are loaded without integrity hashes.

## Manual test checklist

Fill this in after you test. Tick a box only after you really tested it.

- [ ] The app opens without errors in the console
- [ ] The empty dashboard shows the empty state
- [ ] A PDF, an image and a TXT file can be imported
- [ ] DOCX, XLSX and MD files can be imported and previewed
- [ ] An unsupported file, an empty file, a duplicate and a too-large file are rejected with a message
- [ ] Documents are still there after refreshing the page
- [ ] Search finds documents by name, tag and notes
- [ ] Category filter, Favorites view and Recent view work
- [ ] Category, tags and notes can be changed and are kept after a refresh
- [ ] Renaming does not damage the file (the downloaded file opens normally)
- [ ] Delete asks for confirmation and removes the document
- [ ] Backup export, restore and invalid backup files behave as described
- [ ] A file bigger than the preview limit shows the "too large to preview" message and can be downloaded
- [ ] The layout works on a phone-sized screen

## Future improvements

- Full backup with the files inside a ZIP
- A trash (recycle bin) to restore deleted documents
- Search inside PDF and text files
- Support for more file types (for example `.xls`, CSV tables, PowerPoint)
- Optional sign-in and cloud sync