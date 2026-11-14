// DocuNest - config.js
// All settings and constants. No functions here.

const categories = ["Education", "Certificates", "Personal", "Work", "Finance", "Other"];

// title and description for the sidebar views
const pageInfo = {
  all: { title: "All Documents", description: "View and manage all your documents here." },
  favorites: { title: "Favorites", description: "Documents you marked with a star appear here." },
  recent: { title: "Recent Documents", description: "Documents you opened appear here (most recent first)." }
};

// size limits
const MB = 1024 * 1024;
const MAX_FILE_SIZE = 1000 * MB;        // one file
const MAX_TOTAL_STORAGE = 10000 * MB;   // all files together
const MAX_PREVIEW_SIZE = 50 * MB;       // bigger files can be downloaded but not previewed
const FILE_LIMIT_TEXT = (MAX_FILE_SIZE / MB) + " MB";
const STORAGE_LIMIT_TEXT = (MAX_TOTAL_STORAGE / MB) + " MB";

// Every file type the app accepts is in this list.
// To support a new type, add one line here.
// preview can be: "pdf", "image", "text", "markdown", "docx", "xlsx" or "none"
const FILE_TYPES = [
  { label: "PDF", extensions: ["pdf"], icon: "bi-file-earmark-pdf", preview: "pdf" },
  { label: "PNG", extensions: ["png"], icon: "bi-file-earmark-image", preview: "image" },
  { label: "JPG / JPEG", extensions: ["jpg", "jpeg"], icon: "bi-file-earmark-image", preview: "image" },
  { label: "TXT", extensions: ["txt"], icon: "bi-file-earmark-text", preview: "text" },
  { label: "Markdown", extensions: ["md"], icon: "bi-markdown", preview: "markdown" },
  { label: "DOCX", extensions: ["docx"], icon: "bi-file-earmark-word", preview: "docx" },
  { label: "DOC", extensions: ["doc"], icon: "bi-file-earmark-word", preview: "none" },
  { label: "XLSX", extensions: ["xlsx"], icon: "bi-file-earmark-excel", preview: "xlsx" }
];

// all allowed extensions, taken from the list above
const ALLOWED_EXTENSIONS = [];
FILE_TYPES.forEach(function (type) {
  type.extensions.forEach(function (extension) {
    ALLOWED_EXTENSIONS.push(extension);
  });
});

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 20;

// preview limits
const MAX_TEXT_PREVIEW = 200000;   // characters shown for TXT and Markdown
const MAX_SHEET_ROWS = 200;        // rows shown for each Excel sheet
const MAX_SHEET_COLUMNS = 30;      // columns shown for each Excel sheet

const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// these libraries are loaded from a CDN only when a preview needs them
const LIBRARY_URLS = {
  mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js",
  marked: "https://cdn.jsdelivr.net/npm/marked@4.3.0/marked.min.js",
  dompurify: "https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js",
  xlsx: "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
};
const scriptPromises = new Map();   // remembers which libraries were already requested

// backup
const BACKUP_VERSION = 1;
const MAX_BACKUP_FILE_SIZE = 5 * MB;
const BACKUP_FIELDS = [
  "id", "name", "originalName", "type", "extension", "size",
  "category", "tags", "dateAdded", "lastOpened", "favorite", "notes"
];

// database
const DB_NAME = "DocuNestDB";
const DB_VERSION = 2;
const DOCUMENT_STORE = "documents";   // the details of each document
const FILE_STORE = "files";           // the real files (same id as the document)