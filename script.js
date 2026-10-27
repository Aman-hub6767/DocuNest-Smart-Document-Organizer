// DocuNest - Phase 7 script (with the file type dashboard)
// UI + IndexedDB + Import + Organization + Search/Filters + Preview + Backup

// ====================================================
// PART 1: DATA AND SETTINGS
// ====================================================

// The list of categories
const categories = ["Education", "Certificates", "Personal", "Work", "Finance", "Other"];

// Title and description for each sidebar view
const pageInfo = {
  all: {
    title: "All Documents",
    description: "View and manage all your documents here."
  },
  favorites: {
    title: "Favorites",
    description: "Documents you marked with a star appear here."
  },
  recent: {
    title: "Recent Documents",
    description: "Documents you opened appear here (most recent first)."
  }
};

// Import rules
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "txt"];
const MAX_FILE_SIZE = 100 * 1024 * 1024;         // limit for one file: 1000 MB (in bytes)
const MAX_TOTAL_STORAGE = 1000 * 1024 * 1024;    // total DocuNest limit: 10000 MB
const STORAGE_LIMIT_TEXT = Math.round(MAX_TOTAL_STORAGE / (1024 * 1024)) + " MB";

// NEW: The file types shown in the "Storage by File Type" section.
// Each group has a label, the extensions it covers, and an icon.
const FILE_TYPE_GROUPS = [
  { label: "PDF", extensions: ["pdf"], icon: "bi-file-earmark-pdf" },
  { label: "PNG", extensions: ["png"], icon: "bi-file-earmark-image" },
  { label: "JPG / JPEG", extensions: ["jpg", "jpeg"], icon: "bi-file-earmark-image" },
  { label: "TXT", extensions: ["txt"], icon: "bi-file-earmark-text" }
];

// Tag rules
const MAX_TAGS = 10;          // up to 10 tags per document
const MAX_TAG_LENGTH = 20;    // up to 20 characters per tag

// The TXT preview shows at most this many characters (keeps the page fast)
const MAX_TEXT_PREVIEW = 200000;

// PDF.js worker file (PDF.js background helper)
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// Backup rules
const BACKUP_VERSION = 1;                       // backup format version
const MAX_BACKUP_FILE_SIZE = 5 * 1024 * 1024;   // a metadata backup should be far smaller than 5 MB

// ---------- Values that change while the app runs (state) ----------

let allDocuments = [];          // all documents from the database
let currentView = "all";        // "all", "favorites" or "recent"
let selectedCategory = "All";   // category filter
let searchText = "";            // text in the search box (lowercase)
let searchTimer = null;         // timer used for the search delay (debounce)
let editingId = null;           // which document is open in the edit popup

// Preview popup state
let previewRecord = null;       // the document being previewed
let previewToken = 0;           // a number for each preview (to stop old work)
let currentObjectUrl = null;    // temporary image URL (must be revoked later)
let currentPdf = null;          // the open PDF
let currentPageNumber = 1;      // current PDF page
let isRenderingPage = false;    // is a PDF page being drawn right now?
let pdfCanvas = null;
let pdfPrevButton = null;
let pdfNextButton = null;
let pdfPageLabel = null;

// ====================================================
// PART 2: GETTING HTML ELEMENTS
// ====================================================

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
const typeBreakdown = document.getElementById("type-breakdown");   // NEW
const recentList = document.getElementById("recent-list");
const emptyState = document.getElementById("empty-state");
const documentGrid = document.getElementById("document-grid");

// Search and filter elements
const searchInput = document.getElementById("search-input");
const resultInfo = document.getElementById("result-info");
const noResults = document.getElementById("no-results");
const noResultsTitle = document.getElementById("no-results-title");
const noResultsText = document.getElementById("no-results-text");
const clearFiltersButton = document.getElementById("clear-filters-button");

// Edit popup elements
const editModalElement = document.getElementById("edit-modal");
const editModal = new bootstrap.Modal(editModalElement);
const editError = document.getElementById("edit-error");
const editName = document.getElementById("edit-name");
const editCategory = document.getElementById("edit-category");
const editTags = document.getElementById("edit-tags");
const editNotes = document.getElementById("edit-notes");
const editSaveButton = document.getElementById("edit-save-button");

// Preview popup elements
const previewModalElement = document.getElementById("preview-modal");
const previewModal = new bootstrap.Modal(previewModalElement);
const previewTitle = document.getElementById("preview-modal-title");
const previewArea = document.getElementById("preview-area");
const previewInfo = document.getElementById("preview-info");
const downloadButton = document.getElementById("download-button");

// Backup popup elements
const backupModal = new bootstrap.Modal(document.getElementById("backup-modal"));
const backupSummary = document.getElementById("backup-summary");
const backupResult = document.getElementById("backup-result");
const exportButton = document.getElementById("export-button");
const restoreButton = document.getElementById("restore-button");
const restoreInput = document.getElementById("restore-input");

// Tell PDF.js where its worker file is (only if the library loaded)
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
}

// ====================================================
// PART 3: SMALL HELPER FUNCTIONS
// ====================================================

// Creates an HTML element. If text is given, it is set with textContent.
// textContent is safe: a file name is never treated as HTML.
function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

// Shows a success / error / info message (disappears after 5 seconds)
// type: "success", "danger", "warning" or "info"
function showMessage(text, type) {
  const box = document.createElement("div");
  box.className = "alert alert-" + type + " alert-dismissible fade show";
  box.setAttribute("role", "alert");

  const messageText = document.createElement("span");
  messageText.textContent = text;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "btn-close";
  closeButton.setAttribute("data-bs-dismiss", "alert");
  closeButton.setAttribute("aria-label", "Close");

  box.appendChild(messageText);
  box.appendChild(closeButton);
  messageArea.appendChild(box);

  setTimeout(function () {
    box.remove();
  }, 5000);
}

// Makes a file size readable: 1536 -> "1.5 KB"
function formatSize(bytes) {
  if (bytes < 1024) {
    return bytes + " B";
  }
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  }
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// NEW: "1 file" or "3 files"
function formatFileCount(count) {
  return count + (count === 1 ? " file" : " files");
}

// Makes a date readable: "26 Oct 2026"
function formatDate(isoText) {
  return new Date(isoText).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

// Date + time: "26 Oct 2026, 3:45 pm"
function formatDateTime(isoText) {
  return new Date(isoText).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

// Gets the extension from a file name: "Resume.PDF" -> "pdf"
function getExtension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) {
    return "";
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
}

// Icon class for each file extension
function getIconClass(extension) {
  if (extension === "pdf") {
    return "bi-file-earmark-pdf";
  }
  if (extension === "png" || extension === "jpg" || extension === "jpeg") {
    return "bi-file-earmark-image";
  }
  if (extension === "txt") {
    return "bi-file-earmark-text";
  }
  return "bi-file-earmark";
}

// Adds up the size (in bytes) of all documents
// (doc.size || 0 means: if there is no size, count 0, so nothing breaks)
function getTotalSize(documents) {
  let totalBytes = 0;
  documents.forEach(function (doc) {
    totalBytes = totalBytes + (doc.size || 0);
  });
  return totalBytes;
}

// Downloads a Blob as a file with the given name (used by Download and Export)
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoke the temporary URL a little later to free memory
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

// ====================================================
// PART 4: SIDEBAR AND MENU
// ====================================================

function openSidebar() {
  sidebar.classList.add("open");
  sidebarBackdrop.classList.add("show");
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarBackdrop.classList.remove("show");
}

menuButton.addEventListener("click", openSidebar);
sidebarBackdrop.addEventListener("click", closeSidebar);

// Clicking a menu item changes the view (All / Favorites / Recent)
function selectNavItem(clickedItem) {
  const viewName = clickedItem.dataset.view;

  // "Backup" opens a popup instead of changing the view
  if (viewName === "backup") {
    closeSidebar();
    openBackupModal();
    return;
  }

  navItems.forEach(function (item) {
    item.classList.remove("active");
  });
  clickedItem.classList.add("active");

  currentView = viewName;
  pageTitle.textContent = pageInfo[viewName].title;
  pageDescription.textContent = pageInfo[viewName].description;

  refreshView();
  closeSidebar();
}

navItems.forEach(function (item) {
  item.addEventListener("click", function (event) {
    event.preventDefault();   // stops the link from reloading the page
    selectNavItem(item);
  });
});

// ====================================================
// PART 5: SEARCH AND FILTERS
// ====================================================

// How many documents are in a category (out of all documents)
function countByCategory(name) {
  if (name === "All") {
    return allDocuments.length;
  }
  return allDocuments.filter(function (doc) {
    return doc.category === name;
  }).length;
}

// Creates the category buttons: All (5), Education (2), ...
function showCategoryButtons() {
  categoryFilters.innerHTML = "";

  const allNames = ["All"].concat(categories);

  allNames.forEach(function (name) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = name + " (" + countByCategory(name) + ")";

    if (name === selectedCategory) {
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }

    button.addEventListener("click", function () {
      selectCategory(name);
    });

    categoryFilters.appendChild(button);
  });
}

// Choosing a category filters the list
function selectCategory(name) {
  selectedCategory = name;
  refreshView();
}

// Fills the category dropdown in the edit popup
function fillCategoryDropdown() {
  categories.forEach(function (name) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    editCategory.appendChild(option);
  });
}

// Does this document match the search text?
// It looks in the name, extension, category, notes and tags.
// (It does NOT search inside the file content.)
function matchesSearch(doc, text) {
  const searchIn = [
    doc.name,
    doc.extension,
    doc.category,
    doc.notes || "",
    (doc.tags || []).join(" ")
  ].join(" ").toLowerCase();

  return searchIn.includes(text);
}

// Applies view + category + search and returns the documents to display
function getVisibleDocuments() {
  let list = allDocuments.slice();   // a copy, so the original list is not changed

  if (currentView === "favorites") {
    list = list.filter(function (doc) {
      return doc.favorite;
    });
  }

  if (currentView === "recent") {
    // Only documents that were opened, most recently opened first
    list = list.filter(function (doc) {
      return doc.lastOpened;
    });
    list.sort(function (a, b) {
      return b.lastOpened.localeCompare(a.lastOpened);
    });
  }

  if (selectedCategory !== "All") {
    list = list.filter(function (doc) {
      return doc.category === selectedCategory;
    });
  }

  if (searchText !== "") {
    list = list.filter(function (doc) {
      return matchesSearch(doc, searchText);
    });
  }

  return list;
}

// Rebuilds the category buttons and the document list
function refreshView() {
  showCategoryButtons();
  showDocumentGrid(getVisibleDocuments());
}

// Search as you type, but wait 250 ms after the last key (this is called "debounce")
searchInput.addEventListener("input", function () {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    searchText = searchInput.value.trim().toLowerCase();
    refreshView();
  }, 250);
});

// Clears the search text and the category filter
function clearFilters() {
  searchInput.value = "";
  searchText = "";
  selectedCategory = "All";
  refreshView();
}

clearFiltersButton.addEventListener("click", clearFilters);

// Shows the right message when no document matches
function showNoResultsMessage() {
  noResults.classList.remove("d-none");

  const noFilters = searchText === "" && selectedCategory === "All";

  if (currentView === "favorites" && noFilters) {
    noResultsTitle.textContent = "No favorites yet";
    noResultsText.textContent = "Click the star on a document card and it will appear here.";
  } else if (currentView === "recent" && noFilters) {
    noResultsTitle.textContent = "No documents opened yet";
    noResultsText.textContent = "Click the eye (Preview) button on a card and it will appear here.";
  } else {
    noResultsTitle.textContent = "No documents found";
    noResultsText.textContent = "Try a different word, or clear the search and filters.";
  }

  // Show the "Clear" button only when a search or category filter is active
  if (noFilters) {
    clearFiltersButton.classList.add("d-none");
  } else {
    clearFiltersButton.classList.remove("d-none");
  }
}

// ====================================================
// PART 6: INDEXEDDB
// ====================================================

const DB_NAME = "DocuNestDB";     // database name
const DB_VERSION = 1;             // version number
const STORE_NAME = "documents";   // shelf (object store) name

// The open database is kept in "db". It starts empty (null).
let db = null;

// Opens the database. If it is the first time, it also creates it.
function openDatabase() {
  return new Promise(function (resolve, reject) {

    // Check: does this browser support IndexedDB?
    if (!window.indexedDB) {
      reject(new Error("Your browser does not support IndexedDB."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // This runs only when the database is being created for the first time
    request.onupgradeneeded = function (event) {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        // keyPath "id" = a unique number for each record, it grows automatically
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true
        });

        store.createIndex("category", "category", { unique: false });
        store.createIndex("dateAdded", "dateAdded", { unique: false });
      }
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

// Starts a transaction. mode: "readonly" or "readwrite"
function startTransaction(mode) {
  if (db === null) {
    throw new Error("The database is not ready yet.");
  }
  return db.transaction(STORE_NAME, mode);
}

// Saves a NEW record. Returns the new id.
function addDocument(record) {
  return new Promise(function (resolve, reject) {
    const transaction = startTransaction("readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(record);

    let newId = null;

    request.onsuccess = function () {
      newId = request.result;
    };

    // oncomplete = the data is really saved (only then we call it a success)
    transaction.oncomplete = function () {
      resolve(newId);
    };

    // onabort = something went wrong, nothing was saved (for example, storage is full)
    transaction.onabort = function () {
      reject(transaction.error || request.error);
    };
  });
}

// Reads all records
function getAllDocuments() {
  return new Promise(function (resolve, reject) {
    const transaction = startTransaction("readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

// Reads one record by id. Returns undefined if it does not exist.
function getDocumentById(id) {
  return new Promise(function (resolve, reject) {
    const transaction = startTransaction("readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

// Replaces an old record with a new one (same id).
// put() = "update if the id exists, otherwise create"
function updateDocument(record) {
  return new Promise(function (resolve, reject) {
    const transaction = startTransaction("readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);

    transaction.oncomplete = function () {
      resolve();
    };

    transaction.onabort = function () {
      reject(transaction.error || request.error);
    };
  });
}

// Updates many records in ONE transaction.
// A transaction is all-or-nothing: either every record is saved, or none.
function updateManyDocuments(records) {
  return new Promise(function (resolve, reject) {
    const transaction = startTransaction("readwrite");
    const store = transaction.objectStore(STORE_NAME);

    records.forEach(function (record) {
      store.put(record);
    });

    transaction.oncomplete = function () {
      resolve();
    };

    transaction.onabort = function () {
      reject(transaction.error);
    };
  });
}

// Deletes one record permanently
function deleteDocument(id) {
  return new Promise(function (resolve, reject) {
    const transaction = startTransaction("readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    transaction.oncomplete = function () {
      resolve();
    };

    transaction.onabort = function () {
      reject(transaction.error || request.error);
    };
  });
}

// A simple message for an error
function getErrorText(error) {
  if (error && error.name === "QuotaExceededError") {
    return "The browser storage is full. Delete some old documents and try again.";
  }
  if (error && error.message) {
    return error.message;
  }
  return "Something went wrong.";
}

// ====================================================
// PART 7: SHOWING DOCUMENTS
// ====================================================

// Creates a small icon button for a card (eye, star, pencil, trash)
function makeIconButton(iconClass, label, extraClass, onClick) {
  const button = makeElement("button", "icon-button " + extraClass);
  button.type = "button";
  button.title = label;                      // shown when the mouse is over it
  button.setAttribute("aria-label", label);  // for screen readers
  button.appendChild(makeElement("i", "bi " + iconClass));
  button.addEventListener("click", onClick);
  return button;
}

// Creates the card for one document
function createDocumentCard(doc) {
  const column = makeElement("div", "col-12 col-md-6 col-xl-4");
  const card = makeElement("div", "doc-card");

  // Left: the file icon
  const iconBox = makeElement("div", "doc-icon");
  iconBox.appendChild(makeElement("i", "bi " + getIconClass(doc.extension)));

  // Right: name, type + size, category + date, tags, notes, buttons
  const info = makeElement("div", "doc-info");

  const nameLine = makeElement("div", "doc-name", doc.name);
  nameLine.title = doc.name;   // the full name shows when the mouse is over it

  const sizeLine = makeElement(
    "div",
    "doc-meta",
    doc.extension.toUpperCase() + " | " + formatSize(doc.size)
  );

  const categoryLine = makeElement("div", "doc-meta");
  categoryLine.appendChild(makeElement("span", "category-badge", doc.category));
  categoryLine.append(" " + formatDate(doc.dateAdded));

  info.appendChild(nameLine);
  info.appendChild(sizeLine);
  info.appendChild(categoryLine);

  // Tags (show the first 3, then "+2" and so on)
  if (doc.tags && doc.tags.length > 0) {
    const tagLine = makeElement("div", "doc-tags");
    doc.tags.slice(0, 3).forEach(function (tag) {
      tagLine.appendChild(makeElement("span", "tag-badge", tag));
    });
    if (doc.tags.length > 3) {
      tagLine.appendChild(makeElement("span", "tag-badge", "+" + (doc.tags.length - 3)));
    }
    info.appendChild(tagLine);
  }

  // A one-line preview of the notes
  if (doc.notes) {
    const notesLine = makeElement("div", "doc-notes", doc.notes);
    notesLine.title = doc.notes;
    info.appendChild(notesLine);
  }

  // Action buttons: preview, favorite, edit, delete
  const actions = makeElement("div", "doc-actions");

  const previewButton = makeIconButton("bi-eye", "Preview", "", function () {
    openPreview(doc.id);
  });

  const starClass = doc.favorite ? "bi-star-fill" : "bi-star";
  const starLabel = doc.favorite ? "Remove from favorites" : "Add to favorites";
  const favoriteButton = makeIconButton(
    starClass,
    starLabel,
    doc.favorite ? "favorite-on" : "",
    function () {
      toggleFavorite(doc.id);
    }
  );
  favoriteButton.setAttribute("aria-pressed", doc.favorite ? "true" : "false");

  const editButton = makeIconButton("bi-pencil", "Edit details", "", function () {
    openEditModal(doc.id);
  });

  const deleteButton = makeIconButton("bi-trash", "Delete", "danger", function () {
    deleteWithConfirm(doc.id, doc.name);
  });

  actions.appendChild(previewButton);
  actions.appendChild(favoriteButton);
  actions.appendChild(editButton);
  actions.appendChild(deleteButton);
  info.appendChild(actions);

  card.appendChild(iconBox);
  card.appendChild(info);
  column.appendChild(card);
  return column;
}

// Updates the stat cards from REAL data
function updateStats(documents) {
  const totalBytes = getTotalSize(documents);

  let favoriteTotal = 0;
  // A Set keeps only unique values, so it counts each category once
  const usedCategories = new Set();

  documents.forEach(function (doc) {
    if (doc.favorite) {
      favoriteTotal = favoriteTotal + 1;
    }
    usedCategories.add(doc.category);
  });

  totalCount.textContent = documents.length;
  favoritesCount.textContent = favoriteTotal;
  categoryCount.textContent = usedCategories.size;

  // Storage card: how much is used, and what percent of the limit
  const percentUsed = Math.round((totalBytes / MAX_TOTAL_STORAGE) * 100);
  storageUsed.textContent = formatSize(totalBytes);

  // The element next to storageUsed is the label below the number
  storageUsed.nextElementSibling.textContent =
    "of " + STORAGE_LIMIT_TEXT + " used (" + percentUsed + "%)";

  // If 90% or more is used, show the number in red
  if (percentUsed >= 90) {
    storageUsed.style.color = "#dc3545";
  } else {
    storageUsed.style.color = "";
  }
}

// NEW: "Storage by File Type" section.
// For each file type it shows: number of files, storage used, and the share of total storage.
function showTypeBreakdown(documents) {
  typeBreakdown.innerHTML = "";

  // No documents: show a short help message
  if (documents.length === 0) {
    typeBreakdown.appendChild(
      makeElement(
        "p",
        "text-muted mb-0",
        "Import some documents to see how many files of each type you have and how much storage they use."
      )
    );
    return;
  }

  const totalBytes = getTotalSize(documents);

  FILE_TYPE_GROUPS.forEach(function (group) {

    // Only the documents of this type
    const files = documents.filter(function (doc) {
      return group.extensions.includes(doc.extension);
    });

    const groupBytes = getTotalSize(files);
    const percent = totalBytes > 0 ? Math.round((groupBytes / totalBytes) * 100) : 0;

    const row = makeElement("div", "mb-3");

    // Top line: icon + label on the left, numbers on the right
    const topLine = makeElement("div", "d-flex justify-content-between flex-wrap gap-1 mb-1");

    const labelPart = makeElement("span", "fw-semibold");
    const icon = makeElement("i", "bi " + group.icon + " me-2");
    icon.style.color = "var(--primary-color)";
    labelPart.appendChild(icon);
    labelPart.append(group.label);

    const numbersPart = makeElement(
      "span",
      "small text-muted",
      formatFileCount(files.length) + " | " + formatSize(groupBytes) + " (" + percent + "%)"
    );

    topLine.appendChild(labelPart);
    topLine.appendChild(numbersPart);

    // Progress bar: how big is this type's share of the used storage
    const progress = makeElement("div", "progress");
    progress.style.height = "8px";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-label", group.label + " share of used storage");
    progress.setAttribute("aria-valuenow", percent);
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", "100");

    const bar = makeElement("div", "progress-bar");
    bar.style.width = percent + "%";
    bar.style.backgroundColor = "var(--primary-color)";
    progress.appendChild(bar);

    row.appendChild(topLine);
    row.appendChild(progress);
    typeBreakdown.appendChild(row);
  });

  // Last line: the total
  const totalLine = makeElement("div", "d-flex justify-content-between flex-wrap gap-1 border-top pt-2");
  totalLine.appendChild(makeElement("span", "fw-semibold", "Total"));
  totalLine.appendChild(
    makeElement(
      "span",
      "small text-muted",
      formatFileCount(documents.length) + " | " + formatSize(totalBytes) + " of " + STORAGE_LIMIT_TEXT
    )
  );
  typeBreakdown.appendChild(totalLine);
}

// "Recently Added": the 3 newest documents
function showRecentList(documents) {
  recentList.innerHTML = "";

  if (documents.length === 0) {
    recentList.appendChild(
      makeElement("p", "text-muted mb-0", "No documents have been added yet.")
    );
    return;
  }

  documents.slice(0, 3).forEach(function (doc) {
    const row = makeElement("div", "recent-item");
    row.appendChild(makeElement("i", "bi " + getIconClass(doc.extension)));
    row.appendChild(makeElement("span", "recent-name", doc.name));
    row.appendChild(makeElement("span", "recent-date", formatDate(doc.dateAdded)));
    recentList.appendChild(row);
  });
}

// Shows the grid of document cards.
// 3 situations: (1) no documents at all, (2) documents exist but none match, (3) results
function showDocumentGrid(visibleDocuments) {
  documentGrid.innerHTML = "";
  noResults.classList.add("d-none");

  // (1) There are no documents in the database
  if (allDocuments.length === 0) {
    emptyState.classList.remove("d-none");
    documentGrid.classList.add("d-none");
    resultInfo.textContent = "";
    return;
  }

  emptyState.classList.add("d-none");
  resultInfo.textContent =
    "Showing " + visibleDocuments.length + " of " + allDocuments.length + " document(s)";

  // (2) Documents exist, but the search or filter matches none
  if (visibleDocuments.length === 0) {
    documentGrid.classList.add("d-none");
    showNoResultsMessage();
    return;
  }

  // (3) Show the results
  documentGrid.classList.remove("d-none");
  visibleDocuments.forEach(function (doc) {
    documentGrid.appendChild(createDocumentCard(doc));
  });
}

// Reads documents from the database and refreshes the whole dashboard
async function showDocuments() {
  try {
    const allRecords = await getAllDocuments();

    // Keep only records that have the real file (fileBlob)
    allDocuments = allRecords.filter(function (doc) {
      return doc.fileBlob;
    });

    // Newest document first (ISO date text sorts correctly as text)
    allDocuments.sort(function (a, b) {
      return b.dateAdded.localeCompare(a.dateAdded);
    });

    updateStats(allDocuments);
    showTypeBreakdown(allDocuments);   // NEW
    showRecentList(allDocuments);
    refreshView();   // apply filters and show the list
  } catch (error) {
    showMessage("Could not load documents: " + getErrorText(error), "danger");
  }
}

// ====================================================
// PART 8: FILE IMPORT
// ====================================================

// Checks one file.
// If there is a problem, it returns the message. If all is fine, it returns "" (empty).
function checkFile(file, existingDocuments) {
  const extension = getExtension(file.name);

  if (file.size === 0) {
    return "The file is empty (0 bytes).";
  }

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return "This file type is not supported. Only PDF, PNG, JPG, JPEG and TXT are allowed.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "The file is too large (" + formatSize(file.size) + "). The limit is 20 MB per file.";
  }

  // Same name + same size = probably already imported
  const isDuplicate = existingDocuments.some(function (doc) {
    return doc.originalName === file.name && doc.size === file.size;
  });
  if (isDuplicate) {
    return "This file has already been imported.";
  }

  // Total storage limit check
  const usedBytes = getTotalSize(existingDocuments);
  if (usedBytes + file.size > MAX_TOTAL_STORAGE) {
    const freeBytes = Math.max(0, MAX_TOTAL_STORAGE - usedBytes);
    return "This would go over the " + STORAGE_LIMIT_TEXT + " storage limit. Only " +
      formatSize(freeBytes) + " is left. Delete some old documents first.";
  }

  return "";
}

// Builds a record from a file (this goes into IndexedDB)
function makeRecord(file) {
  return {
    name: file.name,                       // display name (changes when renamed)
    originalName: file.name,               // the original name never changes
    type: file.type || "unknown",
    extension: getExtension(file.name),
    size: file.size,
    category: "Other",
    tags: [],
    dateAdded: new Date().toISOString(),
    lastOpened: null,
    favorite: false,
    notes: "",
    fileBlob: file                         // THE REAL FILE (a File is a kind of Blob)
  };
}

// Shows or hides the loading box and disables the import buttons while importing
function setImporting(isOn) {
  if (isOn) {
    importStatus.classList.remove("d-none");
  } else {
    importStatus.classList.add("d-none");
  }

  importButtons.forEach(function (button) {
    button.disabled = isOn;
  });
}

// Imports the selected files one by one
async function importFiles(files) {

  // Nothing selected
  if (files.length === 0) {
    showMessage("No file was selected.", "warning");
    return;
  }

  setImporting(true);
  let savedCount = 0;

  try {
    // Documents already saved (used for the duplicate and storage checks)
    const existingDocuments = await getAllDocuments();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      importStatusText.textContent =
        "Importing: " + (i + 1) + " / " + files.length;

      // Check the file. If there is a problem, tell the user (never skip silently)
      const problem = checkFile(file, existingDocuments);
      if (problem !== "") {
        showMessage(file.name + ": " + problem, "warning");
        continue;
      }

      // Save the file
      try {
        const record = makeRecord(file);
        record.id = await addDocument(record);
        existingDocuments.push(record);   // so duplicates and storage are counted within the same batch
        savedCount = savedCount + 1;
      } catch (error) {
        showMessage(file.name + " could not be saved: " + getErrorText(error), "danger");

        // If the browser storage is full, the remaining files would fail too, so stop
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

  // Show the success message only if something was really saved
  if (savedCount > 0) {
    showMessage(savedCount + " document(s) saved.", "success");
  }

  await showDocuments();
}

// Clicking an Import button opens the file chooser
importButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    fileInput.click();
  });
});

// When files are chosen, start the import
fileInput.addEventListener("change", function () {
  const selectedFiles = Array.from(fileInput.files);
  fileInput.value = "";   // reset, so the same file can be chosen again
  importFiles(selectedFiles);
});

// ====================================================
// PART 9: ORGANIZATION (favorite, delete, edit)
// ====================================================

// Used when a document is not found in the database (for example, deleted in another tab)
async function showMissingDocument() {
  showMessage("This document was not found. It may have been deleted.", "danger");
  await showDocuments();
}

// ---------- Favorite ----------

// Turns favorite on or off and saves it in the database
async function toggleFavorite(id) {
  try {
    const record = await getDocumentById(id);
    if (!record) {
      await showMissingDocument();
      return;
    }

    record.favorite = !record.favorite;   // true <-> false
    await updateDocument(record);
    await showDocuments();
  } catch (error) {
    showMessage("Could not change favorite: " + getErrorText(error), "danger");
  }
}

// ---------- Delete ----------

// Asks for confirmation first, then deletes permanently
async function deleteWithConfirm(id, name) {
  const sure = confirm(
    'Delete "' + name + '" permanently? This cannot be undone.'
  );
  if (!sure) {
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

// ---------- Edit popup ----------

// Shows an error message inside the popup
function showEditError(text) {
  editError.textContent = text;
  editError.classList.remove("d-none");
}

// "a, b , a" -> ["a", "b"]  (removes spaces, empty tags and duplicates)
function parseTags(text) {
  const tags = [];

  text.split(",").forEach(function (part) {
    const tag = part.trim();
    if (tag === "") {
      return;   // skip empty tags
    }

    const alreadyThere = tags.some(function (oldTag) {
      return oldTag.toLowerCase() === tag.toLowerCase();
    });
    if (!alreadyThere) {
      tags.push(tag);
    }
  });

  return tags;
}

// Opens the popup and fills in the document's current details
async function openEditModal(id) {
  try {
    const record = await getDocumentById(id);
    if (!record) {
      await showMissingDocument();
      return;
    }

    editingId = id;
    editError.classList.add("d-none");
    editSaveButton.disabled = false;

    editName.value = record.name;
    editTags.value = (record.tags || []).join(", ");
    editNotes.value = record.notes || "";

    // If the category is not in our list (damaged record), use "Other"
    if (categories.includes(record.category)) {
      editCategory.value = record.category;
    } else {
      editCategory.value = "Other";
    }

    editModal.show();
  } catch (error) {
    showMessage("Could not open the edit popup: " + getErrorText(error), "danger");
  }
}

// "Save changes": check the input, then save to the database
async function saveEdit() {

  // Ignore the click or Enter key while a save is already running
  if (editSaveButton.disabled) {
    return;
  }

  const newName = editName.value.trim();
  const newTags = parseTags(editTags.value);

  // --- Checks ---
  if (newName === "") {
    showEditError("The document name cannot be empty.");
    return;
  }

  if (newTags.length > MAX_TAGS) {
    showEditError("You can add at most " + MAX_TAGS + " tags. You entered " + newTags.length + ".");
    return;
  }

  const tooLongTag = newTags.find(function (tag) {
    return tag.length > MAX_TAG_LENGTH;
  });
  if (tooLongTag) {
    showEditError("This tag is too long: \"" + tooLongTag + "\". The limit is " + MAX_TAG_LENGTH + " characters.");
    return;
  }

  // --- Save ---
  editSaveButton.disabled = true;   // prevents double saving

  try {
    const record = await getDocumentById(editingId);
    if (!record) {
      editModal.hide();
      await showMissingDocument();
      return;
    }

    // Only these 4 things change. fileBlob and originalName stay the same.
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
    // "finally" always runs, even after an early return,
    // so the Save button can never stay disabled by mistake.
    editSaveButton.disabled = false;
  }
}

editSaveButton.addEventListener("click", saveEdit);

// Pressing Enter in the name or tags box also saves
[editName, editTags].forEach(function (input) {
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      saveEdit();
    }
  });
});

// When the popup opens, put the cursor in the name box (helps keyboard users)
editModalElement.addEventListener("shown.bs.modal", function () {
  editName.focus();
});

// ====================================================
// PART 10: PREVIEW
// ====================================================

// Shows a simple message in the preview area
function showPreviewMessage(text) {
  previewArea.appendChild(makeElement("p", "preview-message mb-0", text));
}

// Adds one row to the file information list
function addInfoRow(label, value) {
  previewInfo.appendChild(makeElement("dt", "info-label", label));
  previewInfo.appendChild(makeElement("dd", "info-value", value));
}

// Fills the file information on the right side of the popup
function fillPreviewInfo(record) {
  previewInfo.innerHTML = "";

  addInfoRow("Name", record.name);
  addInfoRow("Original file name", record.originalName);
  addInfoRow("Type", record.extension.toUpperCase() + " (" + record.type + ")");
  addInfoRow("Size", formatSize(record.size));
  addInfoRow("Category", record.category);
  addInfoRow("Added on", formatDateTime(record.dateAdded));

  if (record.lastOpened) {
    addInfoRow("Last opened", formatDateTime(record.lastOpened));
  } else {
    addInfoRow("Last opened", "Not opened before");
  }

  const tagsText = (record.tags && record.tags.length > 0) ? record.tags.join(", ") : "-";
  addInfoRow("Tags", tagsText);
  addInfoRow("Notes", record.notes ? record.notes : "-");
}

// ---------- Image preview ----------

function showImagePreview(record) {
  // A Blob gets a temporary URL. We revoke it when the popup closes.
  currentObjectUrl = URL.createObjectURL(record.fileBlob);

  const image = makeElement("img", "preview-image");
  image.alt = record.name;

  // If the image is damaged, show a clear message instead of a broken icon
  image.addEventListener("error", function () {
    previewArea.innerHTML = "";
    showPreviewMessage("This image could not be opened. The file may be damaged. You can still download it below.");
  });

  image.src = currentObjectUrl;
  previewArea.appendChild(image);
}

// ---------- TXT preview ----------

async function showTextPreview(blob, token) {
  const text = await blob.text();

  // If the popup was closed or changed in the meantime, do nothing
  if (token !== previewToken) {
    return;
  }

  // textContent inside <pre>: the text is never treated as HTML (safe)
  const box = makeElement("pre", "preview-text");
  box.textContent = text.length > MAX_TEXT_PREVIEW ? text.slice(0, MAX_TEXT_PREVIEW) : text;
  previewArea.appendChild(box);

  if (text.length > MAX_TEXT_PREVIEW) {
    previewArea.appendChild(
      makeElement(
        "p",
        "small text-muted mt-2 mb-0",
        "Only the first " + MAX_TEXT_PREVIEW + " characters are shown. Download the file to read all of it."
      )
    );
  }
}

// ---------- PDF preview ----------

// Updates the PDF toolbar (Previous / Page X of Y / Next)
function updatePdfToolbar() {
  if (currentPdf === null) {
    return;
  }

  pdfPageLabel.textContent = "Page " + currentPageNumber + " / " + currentPdf.numPages;
  pdfPrevButton.disabled = isRenderingPage || currentPageNumber <= 1;
  pdfNextButton.disabled = isRenderingPage || currentPageNumber >= currentPdf.numPages;
}

// Draws one PDF page on the canvas
async function renderPdfPage(pageNumber) {
  const pdf = currentPdf;
  const canvas = pdfCanvas;

  if (pdf === null || isRenderingPage) {
    return;
  }
  if (pageNumber < 1 || pageNumber > pdf.numPages) {
    return;
  }

  isRenderingPage = true;
  updatePdfToolbar();

  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.3 });

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport: viewport
    }).promise;

    if (currentPdf === pdf) {
      currentPageNumber = pageNumber;
    }
  } catch (error) {
    // If the popup is already closed, there is no need to show an error
    if (currentPdf === pdf) {
      showMessage("Could not show this PDF page: " + getErrorText(error), "danger");
    }
  }

  if (currentPdf === pdf) {
    isRenderingPage = false;
    updatePdfToolbar();
  }
}

async function showPdfPreview(blob, token) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js did not load. Check your internet connection.");
  }

  // Read the file data and open it with PDF.js
  const data = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;

  // If the popup was closed or changed in the meantime, close this PDF
  if (token !== previewToken) {
    pdf.destroy();
    return;
  }

  currentPdf = pdf;
  currentPageNumber = 1;
  isRenderingPage = false;

  // Toolbar: Previous, page label, Next
  const toolbar = makeElement("div", "pdf-toolbar");

  pdfPrevButton = makeElement("button", "btn btn-outline-secondary btn-sm", "Previous");
  pdfPrevButton.type = "button";
  pdfPrevButton.addEventListener("click", function () {
    renderPdfPage(currentPageNumber - 1);
  });

  pdfPageLabel = makeElement("span", "pdf-page-label", "");

  pdfNextButton = makeElement("button", "btn btn-outline-secondary btn-sm", "Next");
  pdfNextButton.type = "button";
  pdfNextButton.addEventListener("click", function () {
    renderPdfPage(currentPageNumber + 1);
  });

  toolbar.appendChild(pdfPrevButton);
  toolbar.appendChild(pdfPageLabel);
  toolbar.appendChild(pdfNextButton);

  pdfCanvas = makeElement("canvas", "preview-canvas");

  previewArea.appendChild(toolbar);
  previewArea.appendChild(pdfCanvas);

  await renderPdfPage(1);
}

// A simple message for preview errors
function getPreviewErrorText(error) {
  if (error && error.name === "PasswordException") {
    return "This PDF is password-protected, so it cannot be previewed. Download it and open it in your PDF viewer.";
  }
  if (error && error.name === "InvalidPDFException") {
    return "This PDF is damaged or invalid, so it cannot be previewed. You can still download the file below.";
  }
  return "The preview could not be created: " + getErrorText(error) + " You can still download the file.";
}

// Shows the right preview for the file type
async function renderPreview(record, token) {
  previewArea.innerHTML = "";
  const extension = record.extension;

  try {
    if (extension === "pdf") {
      await showPdfPreview(record.fileBlob, token);
    } else if (extension === "png" || extension === "jpg" || extension === "jpeg") {
      showImagePreview(record);
    } else if (extension === "txt") {
      await showTextPreview(record.fileBlob, token);
    } else {
      // Any other type: a clear message, never a broken preview
      showPreviewMessage("A preview is not available for this file type. See the details and use the download button below.");
    }
  } catch (error) {
    if (token !== previewToken) {
      return;   // the popup was already closed
    }
    previewArea.innerHTML = "";
    showPreviewMessage(getPreviewErrorText(error));
  }
}

// Opens the preview popup
async function openPreview(id) {
  try {
    const record = await getDocumentById(id);
    if (!record) {
      await showMissingDocument();
      return;
    }
    if (!record.fileBlob) {
      showMessage("The file for this document is missing or damaged, so it cannot be previewed.", "danger");
      return;
    }

    previewToken = previewToken + 1;
    const myToken = previewToken;
    previewRecord = record;

    previewTitle.textContent = record.name;
    fillPreviewInfo(record);
    previewModal.show();

    await renderPreview(record, myToken);

    // After the preview, save "lastOpened" (the Recent view uses it)
    await markAsOpened(id);
  } catch (error) {
    showMessage("Could not open the preview: " + getErrorText(error), "danger");
  }
}

// Sets lastOpened to the current time. If this fails, the preview is not affected.
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

// When the popup closes: revoke the temporary URL, close the PDF, reset the state
previewModalElement.addEventListener("hidden.bs.modal", function () {
  previewToken = previewToken + 1;   // old running work will now stop

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
  pdfCanvas = null;
  pdfPrevButton = null;
  pdfNextButton = null;
  pdfPageLabel = null;
  isRenderingPage = false;
});

// ---------- Download ----------

// File name for the download: display name + (if missing) the extension
function getDownloadName(record) {
  if (getExtension(record.name) === record.extension) {
    return record.name;
  }
  return record.name + "." + record.extension;
}

// Downloads the real saved file (renaming only changes the name, never the content)
function downloadCurrentFile() {
  if (previewRecord === null) {
    return;
  }
  downloadBlob(previewRecord.fileBlob, getDownloadName(previewRecord));
}

downloadButton.addEventListener("click", downloadCurrentFile);

// ====================================================
// PART 11: BACKUP AND RESTORE
// ====================================================

// Shows a result message inside the backup popup
function showBackupResult(text, type) {
  backupResult.innerHTML = "";
  const box = makeElement("div", "alert alert-" + type + " mb-0", text);
  box.setAttribute("role", "alert");
  backupResult.appendChild(box);
}

// Opens the backup popup
function openBackupModal() {
  backupResult.innerHTML = "";
  backupSummary.textContent =
    allDocuments.length + " document(s) in DocuNest, using " +
    formatSize(getTotalSize(allDocuments)) + " of " + STORAGE_LIMIT_TEXT + ".";
  backupModal.show();
}

// Makes the backup entry for one document.
// Notice: fileBlob (the real file) is NOT included.
function makeBackupItem(doc) {
  return {
    id: doc.id,
    name: doc.name,
    originalName: doc.originalName,
    type: doc.type,
    extension: doc.extension,
    size: doc.size,
    category: doc.category,
    tags: doc.tags || [],
    dateAdded: doc.dateAdded,
    lastOpened: doc.lastOpened || null,
    favorite: doc.favorite === true,
    notes: doc.notes || ""
  };
}

// ---------- Export ----------

function exportMetadata() {
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

  // JSON.stringify turns the object into text. (null, 2) makes it easy to read.
  const text = JSON.stringify(backup, null, 2);
  const blob = new Blob([text], { type: "application/json" });

  const today = new Date().toISOString().slice(0, 10);   // for example "2026-10-26"
  downloadBlob(blob, "docunest-metadata-backup-" + today + ".json");

  showBackupResult(
    backup.documents.length + " document(s) exported. Remember: this file has the details only, not the actual files.",
    "success"
  );
}

exportButton.addEventListener("click", exportMetadata);

// ---------- Restore ----------

// A key that identifies a document: original file name + size
function makeMatchKey(originalName, size) {
  return originalName + "|" + size;
}

// Checks the overall format of the backup. Returns "" if fine, otherwise a message.
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

// Cleans a list of tags from the backup (uses the same rules as the edit popup)
function cleanTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const onlyText = value.filter(function (tag) {
    return typeof tag === "string";
  });

  return parseTags(onlyText.join(","))
    .filter(function (tag) {
      return tag.length <= MAX_TAG_LENGTH;
    })
    .slice(0, MAX_TAGS);
}

// Checks and cleans one backup entry. Returns null if the entry is not usable.
// We never trust the file: every value is checked before it is used.
function cleanBackupItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  if (typeof item.originalName !== "string" || typeof item.size !== "number") {
    return null;
  }

  const name = typeof item.name === "string" ? item.name.trim().slice(0, 100) : "";

  return {
    originalName: item.originalName,
    size: item.size,
    name: name !== "" ? name : item.originalName,
    category: categories.includes(item.category) ? item.category : "Other",
    tags: cleanTags(item.tags),
    notes: typeof item.notes === "string" ? item.notes.trim().slice(0, 500) : "",
    favorite: item.favorite === true
  };
}

// Reads a backup file and restores the details after the user confirms
async function restoreMetadata(file) {

  if (file.size > MAX_BACKUP_FILE_SIZE) {
    showBackupResult("This file is too large to be a metadata backup (maximum 5 MB).", "danger");
    return;
  }

  // Step 1: read the file and turn the text into data
  let data;
  try {
    const text = await file.text();
    data = JSON.parse(text);
  } catch (error) {
    showBackupResult("This file is not valid JSON, so it cannot be restored.", "danger");
    return;
  }

  // Step 2: check the format and version
  const formatProblem = checkBackupFormat(data);
  if (formatProblem !== "") {
    showBackupResult(formatProblem, "danger");
    return;
  }

  try {
    // Step 3: match backup entries with the documents that exist now
    const currentRecords = (await getAllDocuments()).filter(function (doc) {
      return doc.fileBlob;
    });

    const lookup = new Map();   // key -> document
    currentRecords.forEach(function (doc) {
      lookup.set(makeMatchKey(doc.originalName, doc.size), doc);
    });

    const updates = [];                 // documents that will be changed
    const handledKeys = new Set();      // keys already used (to find duplicates in the file)
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

      // Only these details change. fileBlob and originalName stay the same.
      doc.name = clean.name;
      doc.category = clean.category;
      doc.tags = clean.tags;
      doc.notes = clean.notes;
      doc.favorite = clean.favorite;
      updates.push(doc);
    });

    // Step 4: if nothing matches, stop with a helpful message
    if (updates.length === 0) {
      showBackupResult(
        "Nothing to restore. None of the " + data.documents.length +
        " backup entries match a document in DocuNest (same original file name and size). " +
        "Import your original files first, then restore again.",
        "warning"
      );
      return;
    }

    // Step 5: ask for confirmation. Nothing is changed before this.
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

    // Step 6: save all changes in ONE transaction (all or nothing)
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

// The Restore button opens the file chooser
restoreButton.addEventListener("click", function () {
  restoreInput.click();
});

// When a backup file is chosen, start the restore
restoreInput.addEventListener("change", function () {
  const file = restoreInput.files[0];
  restoreInput.value = "";   // reset, so the same file can be chosen again

  if (!file) {
    showBackupResult("No file was selected.", "warning");
    return;
  }
  restoreMetadata(file);
});

// ====================================================
// PART 12: WHEN THE PAGE STARTS
// ====================================================

// Opens the database, then shows the saved documents
async function startDatabase() {
  try {
    await openDatabase();
    await showDocuments();
  } catch (error) {
    dbError.textContent =
      "The database could not be opened: " + getErrorText(error) +
      " Documents cannot be saved or shown.";
    dbError.classList.remove("d-none");

    // If there is no database, turn off the import buttons
    importButtons.forEach(function (button) {
      button.disabled = true;
    });
  }
}

showCategoryButtons();
fillCategoryDropdown();
showTypeBreakdown([]);   // shows the empty message until documents load
startDatabase();

console.log("DocuNest: Phase 7 script loaded (with file type dashboard).");