// DocuNest - script.js
// Documents are saved in the browser with IndexedDB. Nothing is uploaded anywhere.

// ---------- settings ----------

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

// ---------- state and html elements ----------

let db = null;
let allDocuments = [];          // all documents (details only)
let currentView = "all";        // "all", "favorites" or "recent"
let selectedCategory = "All";
let searchText = "";
let searchTimer = null;
let editingId = null;           // the document open in the edit popup

// preview popup
let previewRecord = null;       // details of the document being previewed
let previewFile = null;         // the real file being previewed
let previewToken = 0;           // changes with every preview, so old work can stop
let currentObjectUrl = null;    // temporary image address
let currentPdf = null;
let currentPageNumber = 1;
let isRenderingPage = false;
let pdfCanvas = null;
let pdfPrevButton = null;
let pdfNextButton = null;
let pdfPageLabel = null;

const sidebar = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const menuButton = document.getElementById("menu-button");
const messageArea = document.getElementById("message-area");
const pageTitle = document.getElementById("page-title");
const pageDescription = document.getElementById("page-description");
const categoryFilters = document.getElementById("category-filters");
const categoryCount = document.getElementById("category-count");
const navItems = document.querySelectorAll(".nav-item");
const importButtons = document.querySelectorAll(".import-button");
const fileInput = document.getElementById("file-input");
const importStatus = document.getElementById("import-status");
const importStatusText = document.getElementById("import-status-text");
const dbError = document.getElementById("db-error");
const totalCount = document.getElementById("total-count");
const favoritesCount = document.getElementById("favorites-count");
const storageUsed = document.getElementById("storage-used");
const typeBreakdown = document.getElementById("type-breakdown");
const recentList = document.getElementById("recent-list");
const emptyState = document.getElementById("empty-state");
const documentGrid = document.getElementById("document-grid");
const searchInput = document.getElementById("search-input");
const resultInfo = document.getElementById("result-info");
const noResults = document.getElementById("no-results");
const noResultsTitle = document.getElementById("no-results-title");
const noResultsText = document.getElementById("no-results-text");
const clearFiltersButton = document.getElementById("clear-filters-button");

const editModalElement = document.getElementById("edit-modal");
const editModal = new bootstrap.Modal(editModalElement);
const editError = document.getElementById("edit-error");
const editName = document.getElementById("edit-name");
const editCategory = document.getElementById("edit-category");
const editTags = document.getElementById("edit-tags");
const editNotes = document.getElementById("edit-notes");
const editSaveButton = document.getElementById("edit-save-button");

const previewModalElement = document.getElementById("preview-modal");
const previewModal = new bootstrap.Modal(previewModalElement);
const previewTitle = document.getElementById("preview-modal-title");
const previewArea = document.getElementById("preview-area");
const previewInfo = document.getElementById("preview-info");
const downloadButton = document.getElementById("download-button");

const backupModal = new bootstrap.Modal(document.getElementById("backup-modal"));
const backupSummary = document.getElementById("backup-summary");
const backupResult = document.getElementById("backup-result");
const exportButton = document.getElementById("export-button");
const restoreButton = document.getElementById("restore-button");
const restoreInput = document.getElementById("restore-input");

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
}

// ---------- helper functions ----------

// creates an element. The text is set with textContent, so a file name is never read as html.
function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

// creates an element and adds it to a parent
function addElement(parent, tagName, className, text) {
  const element = makeElement(tagName, className, text);
  parent.appendChild(element);
  return element;
}

function setVisible(element, isVisible) {
  element.classList.toggle("d-none", !isVisible);
}

// type: success, danger, warning or info. The message goes away after 5 seconds.
function showMessage(text, type) {
  const box = addElement(messageArea, "div", "alert alert-" + type + " alert-dismissible fade show");
  box.setAttribute("role", "alert");
  addElement(box, "span", "", text);

  const closeButton = addElement(box, "button", "btn-close");
  closeButton.type = "button";
  closeButton.setAttribute("data-bs-dismiss", "alert");
  closeButton.setAttribute("aria-label", "Close");

  setTimeout(function () {
    box.remove();
  }, 5000);
}

function formatSize(bytes) {
  if (bytes < 1024) {
    return bytes + " B";
  }
  if (bytes < MB) {
    return (bytes / 1024).toFixed(1) + " KB";
  }
  if (bytes < 1024 * MB) {
    return (bytes / MB).toFixed(1) + " MB";
  }
  return (bytes / (1024 * MB)).toFixed(2) + " GB";
}

function formatFileCount(count) {
  if (count === 1) {
    return "1 file";
  }
  return count + " files";
}

// "26 Oct 2026" or, with withTime = true, "26 Oct 2026, 3:45 pm"
function formatDate(isoText, withTime) {
  const options = { day: "2-digit", month: "short", year: "numeric" };
  if (withTime) {
    options.hour = "numeric";
    options.minute = "2-digit";
  }
  return new Date(isoText).toLocaleString("en-IN", options);
}

// "Resume.PDF" gives "pdf"
function getExtension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) {
    return "";
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
}

// finds the FILE_TYPES entry of an extension (undefined if there is none)
function findFileType(extension) {
  return FILE_TYPES.find(function (type) {
    return type.extensions.includes(extension);
  });
}

function getIconClass(extension) {
  const type = findFileType(extension);
  if (type) {
    return type.icon;
  }
  return "bi-file-earmark";
}

function getTotalSize(documents) {
  let totalBytes = 0;
  documents.forEach(function (doc) {
    if (doc.size) {
      totalBytes = totalBytes + doc.size;
    }
  });
  return totalBytes;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

// sets the file chooser list and the "Supported" text from ALLOWED_EXTENSIONS,
// so index.html does not need to change when a file type is added
function updateSupportedTypes() {
  const typeList = ALLOWED_EXTENSIONS.map(function (extension) {
    return extension.toUpperCase();
  }).join(", ");

  fileInput.accept = "." + ALLOWED_EXTENSIONS.join(",.");

  document.querySelectorAll("p").forEach(function (paragraph) {
    if (paragraph.textContent.trim().startsWith("Supported:")) {
      paragraph.textContent =
        "Supported: " + typeList + " | Limit: " + FILE_LIMIT_TEXT + " per file, " +
        STORAGE_LIMIT_TEXT + " total. The real browser storage limit can differ between browsers.";
    }
  });

  const emptyText = emptyState.querySelector(".empty-text");
  if (emptyText) {
    emptyText.textContent = "Import a document, spreadsheet, image or text file to get started.";
  }
}

// ---------- sidebar and menu ----------

function setSidebar(isOpen) {
  sidebar.classList.toggle("open", isOpen);
  sidebarBackdrop.classList.toggle("show", isOpen);
}

menuButton.addEventListener("click", function () {
  setSidebar(true);
});

sidebarBackdrop.addEventListener("click", function () {
  setSidebar(false);
});

// "Backup" opens a popup. The other items change the view.
function selectNavItem(clickedItem) {
  const viewName = clickedItem.dataset.view;

  if (viewName === "backup") {
    setSidebar(false);
    openBackupModal();
    return;
  }

  navItems.forEach(function (item) {
    item.classList.toggle("active", item === clickedItem);
  });

  currentView = viewName;
  pageTitle.textContent = pageInfo[viewName].title;
  pageDescription.textContent = pageInfo[viewName].description;

  refreshView();
  setSidebar(false);
}

navItems.forEach(function (item) {
  item.addEventListener("click", function (event) {
    event.preventDefault();
    selectNavItem(item);
  });
});

// ---------- search and filters ----------

function countByCategory(name) {
  if (name === "All") {
    return allDocuments.length;
  }
  return allDocuments.filter(function (doc) {
    return doc.category === name;
  }).length;
}

function showCategoryButtons() {
  categoryFilters.innerHTML = "";

  ["All"].concat(categories).forEach(function (name) {
    const button = addElement(categoryFilters, "button", "chip", name + " (" + countByCategory(name) + ")");
    button.type = "button";
    button.classList.toggle("active", name === selectedCategory);
    button.setAttribute("aria-pressed", String(name === selectedCategory));
    button.addEventListener("click", function () {
      selectedCategory = name;
      refreshView();
    });
  });
}

function fillCategoryDropdown() {
  categories.forEach(function (name) {
    const option = addElement(editCategory, "option", "", name);
    option.value = name;
  });
}

// looks in name, extension, category, notes and tags (not inside the file)
function matchesSearch(doc, text) {
  let tagsText = "";
  if (doc.tags) {
    tagsText = doc.tags.join(" ");
  }
  let notesText = "";
  if (doc.notes) {
    notesText = doc.notes;
  }
  const searchIn = [doc.name, doc.extension, doc.category, notesText, tagsText].join(" ").toLowerCase();
  return searchIn.includes(text);
}

// applies the view, the category and the search
function getVisibleDocuments() {
  const list = [];

  allDocuments.forEach(function (doc) {
    if (currentView === "favorites" && !doc.favorite) {
      return;
    }
    if (currentView === "recent" && !doc.lastOpened) {
      return;
    }
    if (selectedCategory !== "All" && doc.category !== selectedCategory) {
      return;
    }
    if (searchText !== "" && !matchesSearch(doc, searchText)) {
      return;
    }
    list.push(doc);
  });

  if (currentView === "recent") {
    list.sort(function (a, b) {
      return b.lastOpened.localeCompare(a.lastOpened);
    });
  }

  return list;
}

function refreshView() {
  showCategoryButtons();
  showDocumentGrid(getVisibleDocuments());
}

// search while typing, but wait 250 ms after the last key
searchInput.addEventListener("input", function () {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    searchText = searchInput.value.trim().toLowerCase();
    refreshView();
  }, 250);
});

clearFiltersButton.addEventListener("click", function () {
  searchInput.value = "";
  searchText = "";
  selectedCategory = "All";
  refreshView();
});

function showNoResultsMessage() {
  const noFilters = searchText === "" && selectedCategory === "All";
  let title = "No documents found";
  let text = "Try a different word, or clear the search and filters.";

  if (currentView === "favorites" && noFilters) {
    title = "No favorites yet";
    text = "Click the star on a document card and it will appear here.";
  } else if (currentView === "recent" && noFilters) {
    title = "No documents opened yet";
    text = "Click the eye (Preview) button on a card and it will appear here.";
  }

  noResultsTitle.textContent = title;
  noResultsText.textContent = text;
  setVisible(noResults, true);
  setVisible(clearFiltersButton, !noFilters);
}

// ---------- database ----------

function openDatabase() {
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) {
      reject(new Error("Your browser does not support IndexedDB."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // runs the first time, and when the version number goes up
    request.onupgradeneeded = function () {
      const database = request.result;
      let documentStore = null;

      if (database.objectStoreNames.contains(DOCUMENT_STORE)) {
        documentStore = request.transaction.objectStore(DOCUMENT_STORE);
      } else {
        documentStore = database.createObjectStore(DOCUMENT_STORE, { keyPath: "id", autoIncrement: true });
        documentStore.createIndex("category", "category", { unique: false });
        documentStore.createIndex("dateAdded", "dateAdded", { unique: false });
      }

      if (!database.objectStoreNames.contains(FILE_STORE)) {
        const fileStore = database.createObjectStore(FILE_STORE);
        moveOldFiles(documentStore, fileStore);
      }
    };

    request.onblocked = function () {
      reject(new Error("Please close the other DocuNest tabs and reload this page."));
    };

    request.onsuccess = function () {
      db = request.result;
      resolve(db);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

// Version 1 kept the file inside the document record.
// This moves every file into the "files" store, so a document record only has its details.
function moveOldFiles(documentStore, fileStore) {
  documentStore.openCursor().onsuccess = function (event) {
    const cursor = event.target.result;
    if (cursor === null) {
      return;
    }

    const record = cursor.value;
    if (record.fileBlob) {
      fileStore.put(record.fileBlob, record.id);
      delete record.fileBlob;
      cursor.update(record);
    } else {
      cursor.delete();   // a record without a file is not a real document
    }
    cursor.continue();
  };
}

// Runs one database action inside a transaction.
// We wait for "oncomplete", so success means the data is really saved.
// If something fails (for example the storage is full), "onabort" runs and nothing is saved.
function runDatabase(storeNames, mode, action) {
  return new Promise(function (resolve, reject) {
    if (db === null) {
      reject(new Error("The database is not ready yet."));
      return;
    }

    const transaction = db.transaction(storeNames, mode);
    const request = action(transaction);

    transaction.oncomplete = function () {
      if (request) {
        resolve(request.result);
      } else {
        resolve();
      }
    };

    transaction.onabort = function () {
      reject(transaction.error);
    };
  });
}

// saves the details and the real file together. Returns the new id.
function addDocument(record, file) {
  return runDatabase([DOCUMENT_STORE, FILE_STORE], "readwrite", function (transaction) {
    const request = transaction.objectStore(DOCUMENT_STORE).add(record);
    request.onsuccess = function () {
      transaction.objectStore(FILE_STORE).put(file, request.result);
    };
    return request;
  });
}

function getAllDocuments() {
  return runDatabase(DOCUMENT_STORE, "readonly", function (transaction) {
    return transaction.objectStore(DOCUMENT_STORE).getAll();
  });
}

// returns undefined if the document does not exist
function getDocumentById(id) {
  return runDatabase(DOCUMENT_STORE, "readonly", function (transaction) {
    return transaction.objectStore(DOCUMENT_STORE).get(id);
  });
}

// returns the real file of a document
function getFile(id) {
  return runDatabase(FILE_STORE, "readonly", function (transaction) {
    return transaction.objectStore(FILE_STORE).get(id);
  });
}

// put() replaces the details that have the same id (the file is not touched)
function updateDocument(record) {
  return runDatabase(DOCUMENT_STORE, "readwrite", function (transaction) {
    return transaction.objectStore(DOCUMENT_STORE).put(record);
  });
}

// updates many documents in one transaction (all or nothing)
function updateManyDocuments(records) {
  return runDatabase(DOCUMENT_STORE, "readwrite", function (transaction) {
    const store = transaction.objectStore(DOCUMENT_STORE);
    records.forEach(function (record) {
      store.put(record);
    });
  });
}

// deletes the details and the real file
function deleteDocument(id) {
  return runDatabase([DOCUMENT_STORE, FILE_STORE], "readwrite", function (transaction) {
    transaction.objectStore(FILE_STORE).delete(id);
    return transaction.objectStore(DOCUMENT_STORE).delete(id);
  });
}

function getErrorText(error) {
  if (error && error.name === "QuotaExceededError") {
    return "The browser storage is full. Delete some old documents and try again.";
  }
  if (error && error.message) {
    return error.message;
  }
  return "Something went wrong.";
}

// reads one document. If it is missing, tells the user and returns null.
async function getExistingRecord(id) {
  const record = await getDocumentById(id);
  if (!record) {
    showMessage("This document was not found. It may have been deleted.", "danger");
    await showDocuments();
    return null;
  }
  return record;
}

// ---------- showing documents ----------

function addIconButton(parent, iconClass, label, extraClass, onClick) {
  const button = addElement(parent, "button", "icon-button " + extraClass);
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  addElement(button, "i", "bi " + iconClass);
  button.addEventListener("click", onClick);
  return button;
}

function createDocumentCard(doc) {
  const column = makeElement("div", "col-12 col-md-6 col-xl-4");
  const card = addElement(column, "div", "doc-card");

  const iconBox = addElement(card, "div", "doc-icon");
  addElement(iconBox, "i", "bi " + getIconClass(doc.extension));

  const info = addElement(card, "div", "doc-info");
  const nameLine = addElement(info, "div", "doc-name", doc.name);
  nameLine.title = doc.name;
  addElement(info, "div", "doc-meta", doc.extension.toUpperCase() + " | " + formatSize(doc.size));

  const categoryLine = addElement(info, "div", "doc-meta");
  addElement(categoryLine, "span", "category-badge", doc.category);
  categoryLine.append(" " + formatDate(doc.dateAdded));

  // the first 3 tags, then "+2" and so on
  if (doc.tags && doc.tags.length > 0) {
    const tagLine = addElement(info, "div", "doc-tags");
    doc.tags.slice(0, 3).forEach(function (tag) {
      addElement(tagLine, "span", "tag-badge", tag);
    });
    if (doc.tags.length > 3) {
      addElement(tagLine, "span", "tag-badge", "+" + (doc.tags.length - 3));
    }
  }

  if (doc.notes) {
    const notesLine = addElement(info, "div", "doc-notes", doc.notes);
    notesLine.title = doc.notes;
  }

  const actions = addElement(info, "div", "doc-actions");

  addIconButton(actions, "bi-eye", "Preview", "", function () {
    openPreview(doc.id);
  });

  let starClass = "bi-star";
  let starLabel = "Add to favorites";
  let starExtra = "";
  if (doc.favorite) {
    starClass = "bi-star-fill";
    starLabel = "Remove from favorites";
    starExtra = "favorite-on";
  }
  const favoriteButton = addIconButton(actions, starClass, starLabel, starExtra, function () {
    toggleFavorite(doc.id);
  });
  favoriteButton.setAttribute("aria-pressed", String(doc.favorite === true));

  addIconButton(actions, "bi-pencil", "Edit details", "", function () {
    openEditModal(doc.id);
  });

  addIconButton(actions, "bi-trash", "Delete", "danger", function () {
    deleteWithConfirm(doc.id, doc.name);
  });

  return column;
}

function updateStats(documents) {
  const totalBytes = getTotalSize(documents);
  const usedCategories = new Set();   // a Set keeps each category only once
  let favoriteTotal = 0;

  documents.forEach(function (doc) {
    if (doc.favorite) {
      favoriteTotal = favoriteTotal + 1;
    }
    usedCategories.add(doc.category);
  });

  totalCount.textContent = documents.length;
  favoritesCount.textContent = favoriteTotal;
  categoryCount.textContent = usedCategories.size;

  const percentUsed = Math.round((totalBytes / MAX_TOTAL_STORAGE) * 100);
  storageUsed.textContent = formatSize(totalBytes);
  // the element next to the number is its label
  storageUsed.nextElementSibling.textContent = "of " + STORAGE_LIMIT_TEXT + " used (" + percentUsed + "%)";

  if (percentUsed >= 90) {
    storageUsed.style.color = "#dc3545";
  } else {
    storageUsed.style.color = "";
  }
}

// "Storage by File Type": count, size and share of the total for every type in FILE_TYPES
function showTypeBreakdown(documents) {
  typeBreakdown.innerHTML = "";

  if (documents.length === 0) {
    addElement(
      typeBreakdown, "p", "text-muted mb-0",
      "Import some documents to see how many files of each type you have and how much storage they use."
    );
    return;
  }

  const totalBytes = getTotalSize(documents);

  FILE_TYPES.forEach(function (type) {
    const files = documents.filter(function (doc) {
      return type.extensions.includes(doc.extension);
    });
    const typeBytes = getTotalSize(files);
    let percent = 0;
    if (totalBytes > 0) {
      percent = Math.round((typeBytes / totalBytes) * 100);
    }

    const row = addElement(typeBreakdown, "div", "mb-3");

    const topLine = addElement(row, "div", "d-flex justify-content-between flex-wrap gap-1 mb-1");
    const labelPart = addElement(topLine, "span", "fw-semibold");
    const icon = addElement(labelPart, "i", "bi " + type.icon + " me-2");
    icon.style.color = "var(--primary-color)";
    labelPart.append(type.label);
    addElement(
      topLine, "span", "small text-muted",
      formatFileCount(files.length) + " | " + formatSize(typeBytes) + " (" + percent + "%)"
    );

    const progress = addElement(row, "div", "progress");
    progress.style.height = "8px";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", type.label + " share of used storage");
    progress.setAttribute("aria-valuenow", percent);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");
    const bar = addElement(progress, "div", "progress-bar");
    bar.style.width = percent + "%";
    bar.style.backgroundColor = "var(--primary-color)";
  });

  const totalLine = addElement(typeBreakdown, "div", "d-flex justify-content-between flex-wrap gap-1 border-top pt-2");
  addElement(totalLine, "span", "fw-semibold", "Total");
  addElement(
    totalLine, "span", "small text-muted",
    formatFileCount(documents.length) + " | " + formatSize(totalBytes) + " of " + STORAGE_LIMIT_TEXT
  );
}

// the 3 newest documents
function showRecentList(documents) {
  recentList.innerHTML = "";

  if (documents.length === 0) {
    addElement(recentList, "p", "text-muted mb-0", "No documents have been added yet.");
    return;
  }

  documents.slice(0, 3).forEach(function (doc) {
    const row = addElement(recentList, "div", "recent-item");
    addElement(row, "i", "bi " + getIconClass(doc.extension));
    addElement(row, "span", "recent-name", doc.name);
    addElement(row, "span", "recent-date", formatDate(doc.dateAdded));
  });
}

// three cases: no documents at all, documents exist but none match, or results to show
function showDocumentGrid(visibleDocuments) {
  documentGrid.innerHTML = "";
  setVisible(noResults, false);

  if (allDocuments.length === 0) {
    setVisible(emptyState, true);
    setVisible(documentGrid, false);
    resultInfo.textContent = "";
    return;
  }

  setVisible(emptyState, false);
  resultInfo.textContent = "Showing " + visibleDocuments.length + " of " + allDocuments.length + " document(s)";

  if (visibleDocuments.length === 0) {
    setVisible(documentGrid, false);
    showNoResultsMessage();
    return;
  }

  setVisible(documentGrid, true);
  visibleDocuments.forEach(function (doc) {
    documentGrid.appendChild(createDocumentCard(doc));
  });
}

// reads the database and refreshes the whole dashboard
async function showDocuments() {
  try {
    allDocuments = await getAllDocuments();

    // newest first
    allDocuments.sort(function (a, b) {
      return b.dateAdded.localeCompare(a.dateAdded);
    });

    updateStats(allDocuments);
    showTypeBreakdown(allDocuments);
    showRecentList(allDocuments);
    refreshView();
  } catch (error) {
    showMessage("Could not load documents: " + getErrorText(error), "danger");
  }
}

// ---------- import ----------

// returns a message if there is a problem, or "" if the file is fine
function checkFile(file, existingDocuments) {
  const extension = getExtension(file.name);

  if (file.size === 0) {
    return "The file is empty (0 bytes).";
  }

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    const typeList = ALLOWED_EXTENSIONS.map(function (allowed) {
      return allowed.toUpperCase();
    }).join(", ");
    return "This file type is not supported. Allowed types: " + typeList + ".";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "The file is too large (" + formatSize(file.size) + "). The limit is " + FILE_LIMIT_TEXT + " per file.";
  }

  // same name and same size: probably already imported
  const isDuplicate = existingDocuments.some(function (doc) {
    return doc.originalName === file.name && doc.size === file.size;
  });
  if (isDuplicate) {
    return "This file has already been imported.";
  }

  const usedBytes = getTotalSize(existingDocuments);
  if (usedBytes + file.size > MAX_TOTAL_STORAGE) {
    const freeBytes = Math.max(0, MAX_TOTAL_STORAGE - usedBytes);
    return "This would go over the " + STORAGE_LIMIT_TEXT + " storage limit. Only " +
      formatSize(freeBytes) + " is left. Delete some old documents first.";
  }

  return "";
}

// the details of a document (the real file is saved separately)
function makeRecord(file) {
  return {
    name: file.name,            // display name, changes when renamed
    originalName: file.name,    // never changes
    type: file.type || "unknown",
    extension: getExtension(file.name),
    size: file.size,
    category: "Other",
    tags: [],
    dateAdded: new Date().toISOString(),
    lastOpened: null,
    favorite: false,
    notes: ""
  };
}

function setImporting(isOn) {
  setVisible(importStatus, isOn);
  importButtons.forEach(function (button) {
    button.disabled = isOn;
  });
}

async function importFiles(files) {
  if (files.length === 0) {
    showMessage("No file was selected.", "warning");
    return;
  }

  setImporting(true);
  let savedCount = 0;

  try {
    const existingDocuments = await getAllDocuments();

    for (let i = 0; i < files.length; i = i + 1) {
      const file = files[i];
      importStatusText.textContent = "Importing " + (i + 1) + " of " + files.length + ": " + file.name;

      // a problem is always shown, files are never skipped silently
      const problem = checkFile(file, existingDocuments);
      if (problem !== "") {
        showMessage(file.name + ": " + problem, "warning");
        continue;
      }

      try {
        const record = makeRecord(file);
        record.id = await addDocument(record, file);
        existingDocuments.push(record);   // so duplicates and storage are counted inside the same batch
        savedCount = savedCount + 1;
      } catch (error) {
        showMessage(file.name + " could not be saved: " + getErrorText(error), "danger");

        // if the browser storage is full, the next files would fail too
        if (error && error.name === "QuotaExceededError") {
          showMessage("Storage is full. The remaining files were not imported.", "danger");
          break;
        }
      }
    }
  } catch (error) {
    showMessage("Import failed: " + getErrorText(error), "danger");
  }

  setImporting(false);

  if (savedCount > 0) {
    showMessage(savedCount + " document(s) saved.", "success");
  }

  await showDocuments();
}

importButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    fileInput.click();
  });
});

fileInput.addEventListener("change", function () {
  const selectedFiles = Array.from(fileInput.files);
  fileInput.value = "";   // so the same file can be chosen again
  importFiles(selectedFiles);
});

// ---------- favorite, delete, edit ----------

async function toggleFavorite(id) {
  try {
    const record = await getExistingRecord(id);
    if (record === null) {
      return;
    }
    record.favorite = !record.favorite;
    await updateDocument(record);
    await showDocuments();
  } catch (error) {
    showMessage("Could not change favorite: " + getErrorText(error), "danger");
  }
}

async function deleteWithConfirm(id, name) {
  if (!confirm('Delete "' + name + '" permanently? This cannot be undone.')) {
    return;
  }

  try {
    await deleteDocument(id);
    showMessage("Document deleted.", "success");
    await showDocuments();
  } catch (error) {
    showMessage("Could not delete: " + getErrorText(error), "danger");
  }
}

function showEditError(text) {
  editError.textContent = text;
  setVisible(editError, true);
}

// "a, b , A" gives ["a", "b"] (no spaces, no empty tags, no duplicates)
function parseTags(text) {
  const tags = [];

  text.split(",").forEach(function (part) {
    const tag = part.trim();
    const alreadyThere = tags.some(function (oldTag) {
      return oldTag.toLowerCase() === tag.toLowerCase();
    });
    if (tag !== "" && !alreadyThere) {
      tags.push(tag);
    }
  });

  return tags;
}

async function openEditModal(id) {
  try {
    const record = await getExistingRecord(id);
    if (record === null) {
      return;
    }

    editingId = id;
    setVisible(editError, false);
    editSaveButton.disabled = false;

    editName.value = record.name;

    let tags = [];
    if (record.tags) {
      tags = record.tags;
    }
    editTags.value = tags.join(", ");

    editNotes.value = "";
    if (record.notes) {
      editNotes.value = record.notes;
    }

    editCategory.value = "Other";
    if (categories.includes(record.category)) {
      editCategory.value = record.category;
    }

    editModal.show();
  } catch (error) {
    showMessage("Could not open the edit popup: " + getErrorText(error), "danger");
  }
}

// returns a message if the input is not valid, or "" if it is fine
function findEditProblem(name, tags) {
  if (name === "") {
    return "The document name cannot be empty.";
  }
  if (tags.length > MAX_TAGS) {
    return "You can add at most " + MAX_TAGS + " tags. You entered " + tags.length + ".";
  }
  const longTag = tags.find(function (tag) {
    return tag.length > MAX_TAG_LENGTH;
  });
  if (longTag) {
    return "This tag is too long: \"" + longTag + "\". The limit is " + MAX_TAG_LENGTH + " characters.";
  }
  return "";
}

async function saveEdit() {
  if (editSaveButton.disabled) {
    return;   // a save is already running
  }

  const newName = editName.value.trim();
  const newTags = parseTags(editTags.value);
  const problem = findEditProblem(newName, newTags);
  if (problem !== "") {
    showEditError(problem);
    return;
  }

  editSaveButton.disabled = true;

  try {
    const record = await getExistingRecord(editingId);
    if (record === null) {
      editModal.hide();
      return;
    }

    // only these four things change. originalName and the file stay the same.
    record.name = newName;
    record.category = editCategory.value;
    record.tags = newTags;
    record.notes = editNotes.value.trim();

    await updateDocument(record);
    editModal.hide();
    showMessage("Changes saved.", "success");
    await showDocuments();
  } catch (error) {
    showEditError("Could not save: " + getErrorText(error));
  } finally {
    editSaveButton.disabled = false;   // finally always runs, so Save never stays disabled
  }
}

editSaveButton.addEventListener("click", saveEdit);

// Enter in the name or tags box also saves
[editName, editTags].forEach(function (input) {
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      saveEdit();
    }
  });
});

editModalElement.addEventListener("shown.bs.modal", function () {
  editName.focus();
});

// ---------- preview ----------

// shows a message in the preview area and returns it, so it can be removed later
function showPreviewMessage(text) {
  return addElement(previewArea, "p", "preview-message mb-0", text);
}

function addCutNote() {
  addElement(
    previewArea, "p", "small text-muted mt-2 mb-0",
    "Only the first " + MAX_TEXT_PREVIEW + " characters are shown. Download the file to read all of it."
  );
}

function addInfoRow(label, value) {
  addElement(previewInfo, "dt", "info-label", label);
  addElement(previewInfo, "dd", "info-value", value);
}

function fillPreviewInfo(record) {
  previewInfo.innerHTML = "";

  let lastOpened = "Not opened before";
  if (record.lastOpened) {
    lastOpened = formatDate(record.lastOpened, true);
  }
  let tagsText = "-";
  if (record.tags && record.tags.length > 0) {
    tagsText = record.tags.join(", ");
  }
  let notesText = "-";
  if (record.notes) {
    notesText = record.notes;
  }

  addInfoRow("Name", record.name);
  addInfoRow("Original file name", record.originalName);
  addInfoRow("Type", record.extension.toUpperCase() + " (" + record.type + ")");
  addInfoRow("Size", formatSize(record.size));
  addInfoRow("Category", record.category);
  addInfoRow("Added on", formatDate(record.dateAdded, true));
  addInfoRow("Last opened", lastOpened);
  addInfoRow("Tags", tagsText);
  addInfoRow("Notes", notesText);
}

function showImagePreview(record, file) {
  currentObjectUrl = URL.createObjectURL(file);   // revoked when the popup closes

  const image = addElement(previewArea, "img", "preview-image");
  image.alt = record.name;
  image.addEventListener("error", function () {
    previewArea.innerHTML = "";
    showPreviewMessage("This image could not be opened. The file may be damaged. You can still download it below.");
  });
  image.src = currentObjectUrl;
}

async function showTextPreview(file, token) {
  const text = await file.text();
  if (token !== previewToken) {
    return;   // the popup was closed or changed in the meantime
  }

  addElement(previewArea, "pre", "preview-text", text.slice(0, MAX_TEXT_PREVIEW));
  if (text.length > MAX_TEXT_PREVIEW) {
    addCutNote();
  }
}

// loads a library script from a CDN (only once)
function loadScript(url) {
  if (!scriptPromises.has(url)) {
    scriptPromises.set(url, new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = url;
      script.onload = resolve;
      script.onerror = function () {
        scriptPromises.delete(url);   // allow another try later
        reject(new Error("A helper library could not be loaded. Check your internet connection."));
      };
      document.head.appendChild(script);
    }));
  }
  return scriptPromises.get(url);
}

// Makes html from a Markdown or Word file safe, and returns it inside a box.
// We do not trust these files, so the html is cleaned first.
function createSafeHtmlBox(html) {
  // DOMPurify removes scripts, event handlers, javascript: links, styles and forms
  const cleanHtml = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"],
    FORBID_ATTR: ["style"]
  });

  // read it in a document that is not shown, so nothing loads or runs yet
  const parsed = new DOMParser().parseFromString(cleanHtml, "text/html");

  // only images saved inside the file (data:) are allowed.
  // An image from the internet would send a request to someone else's server.
  parsed.querySelectorAll("img").forEach(function (image) {
    const source = image.getAttribute("src");
    if (source && source.startsWith("data:image/")) {
      image.style.maxWidth = "100%";
      image.style.height = "auto";
    } else {
      image.replaceWith(document.createTextNode("[External image not loaded]"));
    }
  });

  // links open in a new tab and cannot control this page
  parsed.querySelectorAll("a").forEach(function (link) {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  });

  parsed.querySelectorAll("table").forEach(function (table) {
    table.className = "table table-bordered table-sm";
  });

  const box = makeElement("div", "text-start w-100");
  box.style.overflowWrap = "anywhere";
  while (parsed.body.firstChild) {
    box.appendChild(parsed.body.firstChild);
  }
  return box;
}

async function showDocxPreview(file, token) {
  const loading = showPreviewMessage("Loading Word preview...");

  await loadScript(LIBRARY_URLS.mammoth);
  await loadScript(LIBRARY_URLS.dompurify);

  const data = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: data });
  if (token !== previewToken) {
    return;
  }

  loading.remove();

  if (result.value.trim() === "") {
    showPreviewMessage("This Word document has no readable text. You can still download it.");
    return;
  }

  previewArea.appendChild(createSafeHtmlBox(result.value));
  addElement(
    previewArea, "p", "small text-muted mt-3 mb-0",
    "This is a simplified preview. Headers, footers, text boxes and the exact page layout are not shown. Download the file for the full document."
  );
}

async function showMarkdownPreview(file, token) {
  const text = await file.text();
  if (token !== previewToken) {
    return;
  }

  const loading = showPreviewMessage("Loading Markdown preview...");

  // if the libraries cannot be loaded (for example, no internet), show the plain text instead
  try {
    await loadScript(LIBRARY_URLS.marked);
    await loadScript(LIBRARY_URLS.dompurify);
  } catch (error) {
    loading.remove();
    addElement(
      previewArea, "p", "small text-muted mb-2",
      "The formatting libraries could not be loaded (check your internet connection). Showing the plain text instead."
    );
    await showTextPreview(file, token);
    return;
  }

  if (token !== previewToken) {
    return;
  }

  loading.remove();
  previewArea.appendChild(createSafeHtmlBox(marked.parse(text.slice(0, MAX_TEXT_PREVIEW))));
  if (text.length > MAX_TEXT_PREVIEW) {
    addCutNote();
  }
}

// builds a table for one sheet. Cells use textContent, so they are never read as html.
function buildSheetTable(workbook, sheetName) {
  const wrapper = makeElement("div", "w-100");
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    addElement(wrapper, "p", "text-muted mb-0", "This sheet cannot be shown.");
    return wrapper;
  }

  // header: 1 gives every row as a simple list. raw: false gives the text as Excel shows it.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  if (rows.length === 0) {
    addElement(wrapper, "p", "text-muted mb-0", "This sheet is empty.");
    return wrapper;
  }

  const visibleRows = rows.slice(0, MAX_SHEET_ROWS);
  let widestRow = 0;
  visibleRows.forEach(function (row) {
    if (row.length > widestRow) {
      widestRow = row.length;
    }
  });
  const columnCount = Math.min(widestRow, MAX_SHEET_COLUMNS);

  const scroller = addElement(wrapper, "div", "w-100");
  scroller.style.overflow = "auto";
  const table = addElement(scroller, "table", "table table-bordered table-sm mb-0");
  table.style.fontSize = "0.85rem";
  const body = addElement(table, "tbody", "");

  visibleRows.forEach(function (row) {
    const tableRow = addElement(body, "tr", "");
    for (let column = 0; column < columnCount; column = column + 1) {
      let cellText = "";
      if (row[column] !== undefined) {
        cellText = String(row[column]);
      }
      const cell = addElement(tableRow, "td", "", cellText);
      cell.title = cellText;
      cell.style.cssText = "white-space: nowrap; max-width: 300px; overflow: hidden; text-overflow: ellipsis;";
    }
  });

  if (rows.length > MAX_SHEET_ROWS || widestRow > MAX_SHEET_COLUMNS) {
    addElement(
      wrapper, "p", "small text-muted mt-2 mb-0",
      "Showing the first " + MAX_SHEET_ROWS + " rows and " + MAX_SHEET_COLUMNS + " columns. Download the file to see everything."
    );
  }

  return wrapper;
}

async function showSpreadsheetPreview(file, token) {
  const loading = showPreviewMessage("Loading Excel preview...");

  await loadScript(LIBRARY_URLS.xlsx);

  const data = await file.arrayBuffer();
  if (token !== previewToken) {
    return;
  }

  // sheetRows: only the first rows of each sheet are read, so big files stay fast
  const workbook = XLSX.read(new Uint8Array(data), { type: "array", sheetRows: MAX_SHEET_ROWS + 1 });
  loading.remove();

  if (workbook.SheetNames.length === 0) {
    showPreviewMessage("This Excel file has no sheets.");
    return;
  }

  const container = addElement(previewArea, "div", "w-100");
  const tableArea = makeElement("div", "w-100");

  // more than one sheet: a dropdown to choose the sheet
  if (workbook.SheetNames.length > 1) {
    const label = addElement(container, "label", "form-label small mb-1", "Sheet");
    label.htmlFor = "sheet-select";

    const select = addElement(container, "select", "form-select form-select-sm mb-3");
    select.id = "sheet-select";
    workbook.SheetNames.forEach(function (sheetName) {
      const option = addElement(select, "option", "", sheetName);
      option.value = sheetName;
    });

    select.addEventListener("change", function () {
      tableArea.innerHTML = "";
      tableArea.appendChild(buildSheetTable(workbook, select.value));
    });
  }

  tableArea.appendChild(buildSheetTable(workbook, workbook.SheetNames[0]));
  container.appendChild(tableArea);
}

function updatePdfToolbar() {
  if (currentPdf === null) {
    return;
  }
  pdfPageLabel.textContent = "Page " + currentPageNumber + " / " + currentPdf.numPages;
  pdfPrevButton.disabled = isRenderingPage || currentPageNumber <= 1;
  pdfNextButton.disabled = isRenderingPage || currentPageNumber >= currentPdf.numPages;
}

// draws one PDF page on the canvas
async function renderPdfPage(pageNumber) {
  const pdf = currentPdf;
  const canvas = pdfCanvas;

  if (pdf === null || isRenderingPage || pageNumber < 1 || pageNumber > pdf.numPages) {
    return;
  }

  isRenderingPage = true;
  updatePdfToolbar();

  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.3 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;

    if (currentPdf === pdf) {
      currentPageNumber = pageNumber;
    }
  } catch (error) {
    // if the popup is already closed, there is nothing to show
    if (currentPdf === pdf) {
      showMessage("Could not show this PDF page: " + getErrorText(error), "danger");
    }
  }

  if (currentPdf === pdf) {
    isRenderingPage = false;
    updatePdfToolbar();
  }
}

async function showPdfPreview(file, token) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js did not load. Check your internet connection.");
  }

  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;

  // the popup was closed or changed in the meantime
  if (token !== previewToken) {
    pdf.destroy();
    return;
  }

  currentPdf = pdf;
  currentPageNumber = 1;
  isRenderingPage = false;

  const toolbar = addElement(previewArea, "div", "pdf-toolbar");

  pdfPrevButton = addElement(toolbar, "button", "btn btn-outline-secondary btn-sm", "Previous");
  pdfPrevButton.type = "button";
  pdfPrevButton.addEventListener("click", function () {
    renderPdfPage(currentPageNumber - 1);
  });

  pdfPageLabel = addElement(toolbar, "span", "pdf-page-label", "");

  pdfNextButton = addElement(toolbar, "button", "btn btn-outline-secondary btn-sm", "Next");
  pdfNextButton.type = "button";
  pdfNextButton.addEventListener("click", function () {
    renderPdfPage(currentPageNumber + 1);
  });

  pdfCanvas = addElement(previewArea, "canvas", "preview-canvas");
  await renderPdfPage(1);
}

function getPreviewErrorText(error) {
  if (error && error.name === "PasswordException") {
    return "This PDF is password-protected, so it cannot be previewed. Download it and open it in your PDF viewer.";
  }
  if (error && error.name === "InvalidPDFException") {
    return "This PDF is damaged or invalid, so it cannot be previewed. You can still download the file below.";
  }
  return "The preview could not be created: " + getErrorText(error) + " You can still download the file.";
}

// picks the preview by the "preview" value of the file type
async function renderPreview(record, file, token) {
  previewArea.innerHTML = "";

  let kind = "none";
  const type = findFileType(record.extension);
  if (type) {
    kind = type.preview;
  }

  try {
    if (kind === "pdf") {
      await showPdfPreview(file, token);
    } else if (kind === "image") {
      showImagePreview(record, file);
    } else if (kind === "text") {
      await showTextPreview(file, token);
    } else if (kind === "markdown") {
      await showMarkdownPreview(file, token);
    } else if (kind === "docx") {
      await showDocxPreview(file, token);
    } else if (kind === "xlsx") {
      await showSpreadsheetPreview(file, token);
    } else {
      showPreviewMessage("A preview is not available for this file type. Use the Download button to open the file in another program.");
    }
  } catch (error) {
    if (token !== previewToken) {
      return;   // the popup was already closed
    }
    previewArea.innerHTML = "";
    showPreviewMessage(getPreviewErrorText(error));
  }
}

async function openPreview(id) {
  try {
    const record = await getExistingRecord(id);
    if (record === null) {
      return;
    }

    const file = await getFile(id);
    if (!file) {
      showMessage("The file of this document is missing, so it cannot be opened.", "danger");
      return;
    }

    previewToken = previewToken + 1;
    const myToken = previewToken;
    previewRecord = record;
    previewFile = file;

    previewTitle.textContent = record.name;
    fillPreviewInfo(record);
    previewArea.innerHTML = "";
    previewModal.show();

    // very big files are not previewed (it could crash the tab), but they can be downloaded
    if (record.size > MAX_PREVIEW_SIZE) {
      showPreviewMessage(
        "This file is too large to preview (" + formatSize(record.size) + "). Previews work for files up to " +
        formatSize(MAX_PREVIEW_SIZE) + ". Use the Download button instead."
      );
    } else {
      await renderPreview(record, file, myToken);
    }

    await markAsOpened(id);   // the Recent view uses this
  } catch (error) {
    showMessage("Could not open the preview: " + getErrorText(error), "danger");
  }
}

// saves the time the document was opened. If this fails, the preview is not affected.
async function markAsOpened(id) {
  try {
    const freshRecord = await getDocumentById(id);
    if (!freshRecord) {
      return;
    }
    freshRecord.lastOpened = new Date().toISOString();
    await updateDocument(freshRecord);
    await showDocuments();
  } catch (error) {
    console.warn("Could not save lastOpened:", error);
  }
}

// when the popup closes: free the temporary address, close the PDF, reset everything
previewModalElement.addEventListener("hidden.bs.modal", function () {
  previewToken = previewToken + 1;   // old running work will stop

  if (currentPdf !== null) {
    currentPdf.destroy();
    currentPdf = null;
  }
  if (currentObjectUrl !== null) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }

  previewArea.innerHTML = "";
  previewInfo.innerHTML = "";
  previewRecord = null;
  previewFile = null;
  pdfCanvas = null;
  pdfPrevButton = null;
  pdfNextButton = null;
  pdfPageLabel = null;
  isRenderingPage = false;
});

// downloads the real saved file. Renaming only changes the name, never the content.
downloadButton.addEventListener("click", function () {
  if (previewRecord === null || previewFile === null) {
    return;
  }

  let fileName = previewRecord.name;
  if (getExtension(fileName) !== previewRecord.extension) {
    fileName = fileName + "." + previewRecord.extension;
  }
  downloadBlob(previewFile, fileName);
});

// ---------- backup and restore ----------

function showBackupResult(text, type) {
  backupResult.innerHTML = "";
  const box = addElement(backupResult, "div", "alert alert-" + type + " mb-0", text);
  box.setAttribute("role", "alert");
}

async function openBackupModal() {
  backupResult.innerHTML = "";
  const summary =
    allDocuments.length + " document(s) in DocuNest, using " +
    formatSize(getTotalSize(allDocuments)) + " of the " + STORAGE_LIMIT_TEXT + " limit.";
  backupSummary.textContent = summary;
  backupModal.show();

  // ask the browser how much space it gives this site (only an estimate)
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      backupSummary.textContent =
        summary + " The browser allows this site about " + formatSize(estimate.quota) + " in total (estimate).";
    }
  } catch (error) {
    console.warn("Could not read the browser storage estimate:", error);
  }
}

// copies the backup fields of a document (the real file is not copied)
function makeBackupItem(doc) {
  const item = {};
  BACKUP_FIELDS.forEach(function (field) {
    item[field] = doc[field];
  });
  return item;
}

exportButton.addEventListener("click", function () {
  if (allDocuments.length === 0) {
    showBackupResult("There are no documents to export yet.", "warning");
    return;
  }

  const backup = {
    app: "DocuNest",
    type: "metadata-backup",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    note: "This backup contains document details only. It does NOT contain the actual files.",
    documents: allDocuments.map(makeBackupItem)
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const today = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, "docunest-metadata-backup-" + today + ".json");

  showBackupResult(
    backup.documents.length + " document(s) exported. Remember: this file has the details only, not the actual files.",
    "success"
  );
});

// a document is matched by original file name + size
function makeMatchKey(originalName, size) {
  return originalName + "|" + size;
}

// returns "" if the backup format is fine, otherwise a message
function checkBackupFormat(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "This file is not a DocuNest backup.";
  }
  if (data.app !== "DocuNest" || data.type !== "metadata-backup") {
    return "This file is not a DocuNest metadata backup.";
  }
  if (data.version !== BACKUP_VERSION) {
    return "Unsupported backup version (" + data.version + "). This app supports version " + BACKUP_VERSION + ".";
  }
  if (!Array.isArray(data.documents)) {
    return "The backup has no documents list, so it cannot be restored.";
  }
  return "";
}

// checks and cleans one backup entry. Returns null if it cannot be used.
// The backup file is not trusted, so every value is checked.
function cleanBackupItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  if (typeof item.originalName !== "string" || typeof item.size !== "number") {
    return null;
  }

  let name = item.originalName;
  if (typeof item.name === "string" && item.name.trim() !== "") {
    name = item.name.trim().slice(0, 100);
  }

  let category = "Other";
  if (categories.includes(item.category)) {
    category = item.category;
  }

  let tags = [];
  if (Array.isArray(item.tags)) {
    const onlyText = item.tags.filter(function (tag) {
      return typeof tag === "string";
    });
    tags = parseTags(onlyText.join(",")).filter(function (tag) {
      return tag.length <= MAX_TAG_LENGTH;
    }).slice(0, MAX_TAGS);
  }

  let notes = "";
  if (typeof item.notes === "string") {
    notes = item.notes.trim().slice(0, 500);
  }

  return {
    originalName: item.originalName,
    size: item.size,
    name: name,
    category: category,
    tags: tags,
    notes: notes,
    favorite: item.favorite === true
  };
}

async function restoreMetadata(file) {
  if (file.size > MAX_BACKUP_FILE_SIZE) {
    showBackupResult("This file is too large to be a metadata backup (maximum 5 MB).", "danger");
    return;
  }

  // read the text and turn it into data
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (error) {
    showBackupResult("This file is not valid JSON, so it cannot be restored.", "danger");
    return;
  }

  const formatProblem = checkBackupFormat(data);
  if (formatProblem !== "") {
    showBackupResult(formatProblem, "danger");
    return;
  }

  try {
    // match the backup entries with the documents that exist now
    const currentRecords = await getAllDocuments();
    const lookup = new Map();
    currentRecords.forEach(function (doc) {
      lookup.set(makeMatchKey(doc.originalName, doc.size), doc);
    });

    const updates = [];
    const handledKeys = new Set();   // to find duplicate entries inside the file
    let notFoundCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;

    data.documents.forEach(function (item) {
      const clean = cleanBackupItem(item);
      if (clean === null) {
        invalidCount = invalidCount + 1;
        return;
      }

      const key = makeMatchKey(clean.originalName, clean.size);
      if (handledKeys.has(key)) {
        duplicateCount = duplicateCount + 1;
        return;
      }
      handledKeys.add(key);

      const doc = lookup.get(key);
      if (!doc) {
        notFoundCount = notFoundCount + 1;
        return;
      }

      // only these details change. originalName and the file stay the same.
      doc.name = clean.name;
      doc.category = clean.category;
      doc.tags = clean.tags;
      doc.notes = clean.notes;
      doc.favorite = clean.favorite;
      updates.push(doc);
    });

    if (updates.length === 0) {
      showBackupResult(
        "Nothing to restore. None of the " + data.documents.length +
        " backup entries match a document in DocuNest (same original file name and size). " +
        "Import your original files first, then restore again.",
        "warning"
      );
      return;
    }

    // ask first. Nothing is changed before this.
    const sure = confirm(
      "Restore will replace the name, category, tags, notes and favorite status of " +
      updates.length + " existing document(s) with the values from the backup.\n\n" +
      notFoundCount + " backup entry(ies) have no matching document and will be skipped.\n\n" +
      "Do you want to continue?"
    );
    if (!sure) {
      showBackupResult("Restore cancelled. Nothing was changed.", "info");
      return;
    }

    await updateManyDocuments(updates);
    await showDocuments();

    showBackupResult(
      "Restore finished. Updated: " + updates.length +
      ". Skipped (no matching document): " + notFoundCount +
      ". Skipped (invalid entries): " + invalidCount +
      ". Skipped (duplicate entries): " + duplicateCount + ".",
      "success"
    );
  } catch (error) {
    showBackupResult("Restore failed. Nothing was changed. " + getErrorText(error), "danger");
  }
}

restoreButton.addEventListener("click", function () {
  restoreInput.click();
});

restoreInput.addEventListener("change", function () {
  const file = restoreInput.files[0];
  restoreInput.value = "";

  if (!file) {
    showBackupResult("No file was selected.", "warning");
    return;
  }
  restoreMetadata(file);
});

// ---------- start ----------

async function startDatabase() {
  try {
    await openDatabase();
    await showDocuments();
  } catch (error) {
    dbError.textContent =
      "The database could not be opened: " + getErrorText(error) +
      " Documents cannot be saved or shown.";
    setVisible(dbError, true);

    importButtons.forEach(function (button) {
      button.disabled = true;
    });
  }
}

updateSupportedTypes();
showCategoryButtons();
fillCategoryDropdown();
showTypeBreakdown([]);
startDatabase();

console.log("DocuNest started.");