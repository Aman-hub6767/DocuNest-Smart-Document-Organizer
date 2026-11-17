# DocuNest: Smart Document Organizer

**Project Report**

## 1. Abstract

DocuNest is a frontend-only web application that helps a user store, organize, search and preview personal documents in the browser. It does not need a server or a login. All files and their details are saved on the user's own device with IndexedDB, so nothing is uploaded anywhere. The project is built with HTML, CSS, JavaScript and Bootstrap 5. It supports PDF, PNG, JPG, JPEG, TXT, Markdown, DOC, DOCX and XLSX files, and gives categories, tags, notes, favorites, recent history, previews and a metadata backup.

## 2. Introduction

People keep many documents such as certificates, resumes, bills and study material in different folders. Finding a file later is slow, and many online tools ask the user to upload private files to a server. DocuNest solves this by working fully inside the browser. The user imports a file once, adds a category, tags and notes, and can then find it quickly with search and filters.

## 3. Problem Statement

- Documents are scattered across folders and are hard to find.
- File names alone do not give enough information to search.
- Cloud tools need an account and upload private files to someone else's server.
- Beginners need a simple tool that works offline and is easy to understand.

## 4. Objectives

- Build a simple, clean dashboard to manage documents.
- Store files safely in the browser with no backend.
- Let the user organize files with categories, tags, notes and favorites.
- Provide fast search and category filters.
- Preview common file types inside the app.
- Give a backup and restore option for document details.
- Keep the code simple, readable and easy to extend.

## 5. Scope and Limitations

**Scope:** a single-user, browser-based document organizer for personal use.

**Limitations:**

- Data lives only in one browser on one device. Clearing site data deletes it.
- The backup file contains document details only, not the actual files.
- Search looks at name, extension, category, notes and tags, not inside the file content.
- DOC files cannot be previewed (only downloaded).
- Files above 50 MB cannot be previewed, but can be downloaded.
- The real storage limit depends on the browser and the device.

## 6. Technology Stack

| Part | Technology |
| --- | --- |
| Structure | HTML5 |
| Styling | CSS3, Bootstrap 5.3.3, Bootstrap Icons |
| Logic | Vanilla JavaScript (no framework) |
| Storage | IndexedDB (browser database) |
| PDF preview | PDF.js 3.11.174 |
| Word preview | Mammoth.js 1.6.0 |
| Markdown preview | Marked 4.3.0 |
| Excel preview | SheetJS (xlsx) 0.20.3 |
| HTML cleaning | DOMPurify 3.0.6 |
| Tools | VS Code, browser developer tools |

The preview libraries for Word, Markdown and Excel are loaded from a CDN only when a preview needs them, so the first page load stays light.

## 7. System Design

### 7.1 Architecture

DocuNest is a single-page application. The browser loads `index.html`, which loads the CSS and then ten JavaScript files in a fixed order. There is no server. The JavaScript talks directly to IndexedDB.

### 7.2 Database design

The database is named `DocuNestDB` (version 2) and has two object stores:

- **documents:** the details of each document. Fields are id, name, originalName, type, extension, size, category, tags, dateAdded, lastOpened, favorite and notes.
- **files:** the real file (Blob), saved with the same id as the document.

Keeping details and files in separate stores makes listing and searching fast, because the app does not have to load large files just to show cards. Version 1 stored the file inside the document record, so the upgrade code moves old files into the new store automatically.

### 7.3 Code structure

| File | Purpose |
| --- | --- |
| `config.js` | Settings, limits, supported file types, library URLs, database names |
| `dom.js` | State variables, HTML elements and Bootstrap modals |
| `helpers.js` | Small helper functions (create elements, format size and date, parse tags) |
| `db.js` | All IndexedDB operations |
| `ui.js` | Sidebar, search, filters, cards, statistics, storage breakdown |
| `import.js` | File checks and saving imported files |
| `edit.js` | Favorite, delete and the edit popup |
| `preview.js` | Preview for PDF, image, TXT, Markdown, DOCX and XLSX |
| `backup.js` | Export and restore of document details |
| `main.js` | Starts the app |

The files are plain scripts, not ES modules, so the project also works when opened directly from the file system.

## 8. Features

### 8.1 Import

The user can select many files at once. Each file is checked for emptiness, allowed type, size limit (1000 MB per file), duplicate (same name and size) and total storage limit (10000 MB). A clear message is shown for every file that is skipped. If the browser storage becomes full, the import stops with a message.

### 8.2 Organize

Every document has a category (Education, Certificates, Personal, Work, Finance or Other), up to 10 tags of 20 characters each, and a note of up to 500 characters. The display name can be changed, but the original file name never changes.

### 8.3 Search and filter

Search runs while typing, with a 250 ms delay to avoid extra work. Category buttons show the count of documents in each category. Search and category filters work together with the All, Favorites and Recent views.

### 8.4 Dashboard

The dashboard shows total documents, favorites, categories in use and storage used. It also shows a Storage by File Type section with count, size and percentage for every type, and a list of the three newest documents.

### 8.5 Preview and download

| File type | Preview method |
| --- | --- |
| PDF | Rendered on a canvas with PDF.js, with Previous and Next buttons |
| PNG, JPG, JPEG | Shown as an image |
| TXT | Plain text (first 200,000 characters) |
| Markdown | Converted to HTML and cleaned |
| DOCX | Converted to simplified HTML with Mammoth.js |
| XLSX | Shown as a table (first 200 rows and 30 columns of each sheet, with a sheet selector) |
| DOC | No preview, download only |

The saved file can always be downloaded from the preview popup.

### 8.6 Favorites and Recent

The star button adds a document to Favorites. Opening a preview saves the time, and the Recent view lists documents with the latest opened first.

### 8.7 Backup and restore

The user can export document details as a JSON file. On restore, each entry is matched with an existing document by original file name and size. The app asks for confirmation before changing anything, and all updates are saved in one transaction, so either all succeed or none are saved.

## 9. Security and Reliability

- **No data leaves the device.** There is no server upload.
- **No unsafe HTML.** File names and notes are inserted with `textContent`, so they are never read as HTML.
- **Safe previews.** Markdown and Word content is cleaned with DOMPurify. Scripts, event handlers, styles and forms are removed. Only images stored inside the file are shown, and images from the internet are blocked.
- **Safe links.** Links in previews open in a new tab with `noopener noreferrer`.
- **Backup file is not trusted.** Every value in a restored file is checked and cleaned.
- **Safe saving.** The app waits for the database transaction to complete before reporting success, and a failed transaction saves nothing.
- **Stale preview protection.** A token system stops old preview work if the popup is closed or changed.
- **Memory cleanup.** Temporary image addresses are released and the PDF is closed when the popup closes.

## 10. Testing

| Test | Expected result |
| --- | --- |
| Import a supported file | Saved and shown as a card |
| Import an unsupported or empty file | Warning message, file skipped |
| Import the same file twice | Duplicate warning |
| Edit name, category, tags, notes | Changes saved and shown |
| Add more than 10 tags or a tag over 20 characters | Error message |
| Search and category filter together | Only matching cards shown |
| Star a document | Appears in Favorites |
| Preview each supported type | Content shown or a clear message |
| Preview a password-protected PDF | Clear message, download still works |
| Delete a document | Removed after confirmation |
| Export and restore backup | Details restored for matching files |
| Open with no internet | Core app works, some previews show a message |

## 11. Future Scope

- Backup that includes the actual files (for example as a ZIP).
- Search inside file content.
- Dark mode.
- Sort options (by name, size or date).
- Installable offline app (PWA).
- Optional cloud sync.

## 12. Conclusion

DocuNest shows that a useful document manager can be built with only frontend technologies. It keeps user data private, works without a backend, and stays simple enough to understand and extend. The project covers important concepts such as IndexedDB, asynchronous JavaScript, safe handling of untrusted content, and clean code organization.

## 13. References

- MDN Web Docs: IndexedDB API, Blob, File API
- Bootstrap 5 documentation
- PDF.js documentation
- Mammoth.js, Marked, SheetJS and DOMPurify documentation
