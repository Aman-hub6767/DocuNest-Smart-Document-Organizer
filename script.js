// DocuNest - Phase 6 script
// UI + IndexedDB + Import + Organization + Search/Filters + Preview

// ====================================================
// PART 1: DATA AUR SETTINGS
// ====================================================

// Hamari categories ki list
const categories = ["Education", "Certificates", "Personal", "Work", "Finance", "Other"];

// Har sidebar menu ka title aur description
const pageInfo = {
  all: {
    title: "All Documents",
    description: "Apne saare documents yahan dekho aur manage karo."
  },
  favorites: {
    title: "Favorites",
    description: "Jin documents par star lagaya hai, wo yahan dikhenge."
  },
  recent: {
    title: "Recent Documents",
    description: "Jo documents aapne khole hain, wo yahan dikhenge (sabse naya pehle)."
  },
  backup: {
    title: "Backup",
    description: "Documents ki details ka backup yahan se milega."
  }
};

// Import ke rules
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "txt"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;         // ek file ki limit: 20 MB (bytes mein)
const MAX_TOTAL_STORAGE = 100 * 1024 * 1024;    // DocuNest ki total limit: 100 MB
const STORAGE_LIMIT_TEXT = Math.round(MAX_TOTAL_STORAGE / (1024 * 1024)) + " MB";

// Tags ke rules
const MAX_TAGS = 10;          // ek document par max 10 tags
const MAX_TAG_LENGTH = 20;    // ek tag max 20 letters

// TXT preview mein max itne characters dikhayenge (bahut badi file se page na atke)
const MAX_TEXT_PREVIEW = 200000;

// PDF.js ka worker file (PDF.js ka background helper)
const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ---------- Jo cheezein badalti rehti hain (state) ----------

let allDocuments = [];          // database ke saare documents
let currentView = "all";        // "all", "favorites" ya "recent"
let selectedCategory = "All";   // category filter
let searchText = "";            // search box ka text (chhote letters mein)
let searchTimer = null;         // search ka timer (debounce ke liye)
let editingId = null;           // edit popup mein kaunsa document hai

// Preview popup ki state
let previewRecord = null;       // abhi kaunsa document preview ho raha hai
let previewToken = 0;           // har preview ka number (purane kaam ko rokne ke liye)
let currentObjectUrl = null;    // image ka temporary URL (baad mein revoke karna hai)
let currentPdf = null;          // khula hua PDF
let currentPageNumber = 1;      // PDF ka current page
let isRenderingPage = false;    // PDF page ban raha hai ya nahi
let pdfCanvas = null;
let pdfPrevButton = null;
let pdfNextButton = null;
let pdfPageLabel = null;

// ====================================================
// PART 2: HTML ELEMENTS PAKADNA
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
const recentList = document.getElementById("recent-list");
const emptyState = document.getElementById("empty-state");
const documentGrid = document.getElementById("document-grid");

// Search aur filter ke elements (NAYA)
const searchInput = document.getElementById("search-input");
const resultInfo = document.getElementById("result-info");
const noResults = document.getElementById("no-results");
const noResultsTitle = document.getElementById("no-results-title");
const noResultsText = document.getElementById("no-results-text");
const clearFiltersButton = document.getElementById("clear-filters-button");

// Edit popup ke elements
const editModalElement = document.getElementById("edit-modal");
const editModal = new bootstrap.Modal(editModalElement);
const editError = document.getElementById("edit-error");
const editName = document.getElementById("edit-name");
const editCategory = document.getElementById("edit-category");
const editTags = document.getElementById("edit-tags");
const editNotes = document.getElementById("edit-notes");
const editSaveButton = document.getElementById("edit-save-button");

// Preview popup ke elements (NAYA)
const previewModalElement = document.getElementById("preview-modal");
const previewModal = new bootstrap.Modal(previewModalElement);
const previewTitle = document.getElementById("preview-modal-title");
const previewArea = document.getElementById("preview-area");
const previewInfo = document.getElementById("preview-info");
const downloadButton = document.getElementById("download-button");

// PDF.js ko worker ka address batao (agar library load hui hai)
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
}

// ====================================================
// PART 3: CHHOTE HELPER FUNCTIONS
// ====================================================

// Ek HTML element banata hai. text diya ho to textContent se lagata hai.
// textContent safe hai: file ka naam kabhi HTML ki tarah nahi chalega.
function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

// Success / error / info message dikhata hai (5 second baad hat jata hai)
// type: "success", "danger", "warning" ya "info"
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

// File ka size padhne layak banata hai: 1536 -> "1.5 KB"
function formatSize(bytes) {
  if (bytes < 1024) {
    return bytes + " B";
  }
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  }
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Date ko padhne layak banata hai: "26 Oct 2026"
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

// File ke naam se extension nikalta hai: "Resume.PDF" -> "pdf"
function getExtension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) {
    return "";
  }
  return fileName.slice(dotIndex + 1).toLowerCase();
}

// Extension ke hisaab se icon ki class
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

// Saare documents ka total size (bytes mein) jodta hai
// (doc.size || 0 = agar size na ho to 0 maano, taaki galti na aaye)
function getTotalSize(documents) {
  let totalBytes = 0;
  documents.forEach(function (doc) {
    totalBytes = totalBytes + (doc.size || 0);
  });
  return totalBytes;
}

// ====================================================
// PART 4: SIDEBAR AUR MENU
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

// Menu item dabane par view badalta hai (All / Favorites / Recent)
function selectNavItem(clickedItem) {
  const viewName = clickedItem.dataset.view;

  // Backup abhi bana nahi hai, isliye sach batate hain
  if (viewName === "backup") {
    showMessage("Backup feature Phase 7 mein banayenge.", "info");
    closeSidebar();
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
    event.preventDefault();   // link ko page reload karne se rokta hai
    selectNavItem(item);
  });
});

// ====================================================
// PART 5: SEARCH AUR FILTERS (NAYA - PHASE 6)
// ====================================================

// Ek category ke kitne documents hain (sabhi documents mein se)
function countByCategory(name) {
  if (name === "All") {
    return allDocuments.length;
  }
  return allDocuments.filter(function (doc) {
    return doc.category === name;
  }).length;
}

// Category buttons banata hai: All (5), Education (2), ...
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

// Category select karne par list filter hoti hai
function selectCategory(name) {
  selectedCategory = name;
  refreshView();
}

// Edit popup ke dropdown mein categories bharta hai
function fillCategoryDropdown() {
  categories.forEach(function (name) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    editCategory.appendChild(option);
  });
}

// Kya ye document search text se match karta hai?
// Naam, extension, category, notes aur tags mein dhoondhta hai.
// (File ke ANDAR ke text mein search NAHI hota.)
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

// View + category + search teeno lagake, jo documents dikhane hain unki list banata hai
function getVisibleDocuments() {
  let list = allDocuments.slice();   // copy (original list kharab na ho)

  if (currentView === "favorites") {
    list = list.filter(function (doc) {
      return doc.favorite;
    });
  }

  if (currentView === "recent") {
    // Sirf wo jo kabhi khole gaye hain, sabse haal ka pehle
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

// Category buttons aur document list dobara banata hai
function refreshView() {
  showCategoryButtons();
  showDocumentGrid(getVisibleDocuments());
}

// Search box mein likhne par (250ms ruk kar) list filter karo
// Isse "debounce" kehte hain: har akshar par kaam nahi, likhna rukne par kaam
searchInput.addEventListener("input", function () {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    searchText = searchInput.value.trim().toLowerCase();
    refreshView();
  }, 250);
});

// Search aur category filter hatata hai
function clearFilters() {
  searchInput.value = "";
  searchText = "";
  selectedCategory = "All";
  refreshView();
}

clearFiltersButton.addEventListener("click", clearFilters);

// Jab koi document match na kare, to sahi message dikhata hai
function showNoResultsMessage() {
  noResults.classList.remove("d-none");

  const noFilters = searchText === "" && selectedCategory === "All";

  if (currentView === "favorites" && noFilters) {
    noResultsTitle.textContent = "Abhi koi favorite nahi hai";
    noResultsText.textContent = "Kisi card par star dabao, wo yahan dikhega.";
  } else if (currentView === "recent" && noFilters) {
    noResultsTitle.textContent = "Abhi koi document open nahi hua";
    noResultsText.textContent = "Card par eye (Preview) button dabao, wo yahan dikhega.";
  } else {
    noResultsTitle.textContent = "Koi document match nahi hua";
    noResultsText.textContent = "Dusra word try karo, ya search aur filter hatao.";
  }

  // "Filter hatao" button sirf tab jab koi search/category lagi ho
  if (noFilters) {
    clearFiltersButton.classList.add("d-none");
  } else {
    clearFiltersButton.classList.remove("d-none");
  }
}

// ====================================================
// PART 6: INDEXEDDB
// ====================================================

const DB_NAME = "DocuNestDB";     // database ka naam
const DB_VERSION = 1;             // version number
const STORE_NAME = "documents";   // shelf (object store) ka naam

// "db" mein open database aayega. Shuru mein khali (null) hai.
let db = null;

// Database kholta hai. Agar pehli baar hai to bana bhi deta hai.
function openDatabase() {
  return new Promise(function (resolve, reject) {

    // Check: kya ye browser IndexedDB support karta hai?
    if (!window.indexedDB) {
      reject(new Error("Aapka browser IndexedDB support nahi karta."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Ye sirf tab chalta hai jab database pehli baar ban raha ho
    request.onupgradeneeded = function (event) {
      const database = event.target.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        // keyPath "id" = har record ka unique number, apne aap badhta hai
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

// Transaction shuru karta hai. mode: "readonly" ya "readwrite"
function startTransaction(mode) {
  if (db === null) {
    throw new Error("Database abhi ready nahi hai.");
  }
  return db.transaction(STORE_NAME, mode);
}

// Ek NAYA record save karta hai. Naya id wapas deta hai.
function addDocument(record) {
  return new Promise(function (resolve, reject) {
    const transaction = startTransaction("readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(record);

    let newId = null;

    request.onsuccess = function () {
      newId = request.result;
    };

    // oncomplete = data pakka save ho gaya (tabhi success maanenge)
    transaction.oncomplete = function () {
      resolve(newId);
    };

    // onabort = kuch gadbad hui, save NAHI hua (jaise storage full)
    transaction.onabort = function () {
      reject(transaction.error || request.error);
    };
  });
}

// Saare records padhta hai
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

// Ek record id se padhta hai. Na mile to undefined deta hai.
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

// Purane record ko naye record se badal deta hai (same id).
// put() = "agar id hai to update karo, nahi hai to naya banao"
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

// Ek record permanently delete karta hai
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

// Error ka simple message
function getErrorText(error) {
  if (error && error.name === "QuotaExceededError") {
    return "Browser ki storage full hai. Kuch purane documents delete karo.";
  }
  if (error && error.message) {
    return error.message;
  }
  return "Kuch galat ho gaya.";
}

// ====================================================
// PART 7: DOCUMENTS DIKHANA
// ====================================================

// Card ka ek chhota icon button banata hai (eye, star, pencil, trash)
function makeIconButton(iconClass, label, extraClass, onClick) {
  const button = makeElement("button", "icon-button " + extraClass);
  button.type = "button";
  button.title = label;                      // mouse le jane par dikhega
  button.setAttribute("aria-label", label);  // screen reader ke liye
  button.appendChild(makeElement("i", "bi " + iconClass));
  button.addEventListener("click", onClick);
  return button;
}

// Ek document ka card banata hai
function createDocumentCard(doc) {
  const column = makeElement("div", "col-12 col-md-6 col-xl-4");
  const card = makeElement("div", "doc-card");

  // Left: file ka icon
  const iconBox = makeElement("div", "doc-icon");
  iconBox.appendChild(makeElement("i", "bi " + getIconClass(doc.extension)));

  // Right: naam, type + size, category + date, tags, notes, buttons
  const info = makeElement("div", "doc-info");

  const nameLine = makeElement("div", "doc-name", doc.name);
  nameLine.title = doc.name;   // mouse le jane par poora naam dikhega

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

  // Tags (pehle 3 dikhao, baaki "+2" jaise)
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

  // Notes ki ek line ka preview
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
  const starLabel = doc.favorite ? "Favorite se hatao" : "Favorite banao";
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

// Stat cards ko REAL data se update karta hai
function updateStats(documents) {
  const totalBytes = getTotalSize(documents);

  let favoriteTotal = 0;
  documents.forEach(function (doc) {
    if (doc.favorite) {
      favoriteTotal = favoriteTotal + 1;
    }
  });

  totalCount.textContent = documents.length;
  favoritesCount.textContent = favoriteTotal;

  // Storage card: "used" aur "limit ka kitna percent"
  const percentUsed = Math.round((totalBytes / MAX_TOTAL_STORAGE) * 100);
  storageUsed.textContent = formatSize(totalBytes);

  // storageUsed ke bagal wala element = neeche ka label
  storageUsed.nextElementSibling.textContent =
    "of " + STORAGE_LIMIT_TEXT + " used (" + percentUsed + "%)";

  // 90% ya zyada ho gaya to number laal kar do
  if (percentUsed >= 90) {
    storageUsed.style.color = "#dc3545";
  } else {
    storageUsed.style.color = "";
  }
}

// "Recently Added" mein sabse naye 3 documents
function showRecentList(documents) {
  recentList.innerHTML = "";

  if (documents.length === 0) {
    recentList.appendChild(
      makeElement("p", "text-muted mb-0", "Abhi koi document add nahi hua.")
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

// Document cards ka grid dikhata hai.
// 3 haalat: (1) ek bhi document nahi, (2) documents hain par match nahi, (3) results hain
function showDocumentGrid(visibleDocuments) {
  documentGrid.innerHTML = "";
  noResults.classList.add("d-none");

  // (1) Database mein ek bhi document nahi
  if (allDocuments.length === 0) {
    emptyState.classList.remove("d-none");
    documentGrid.classList.add("d-none");
    resultInfo.textContent = "";
    return;
  }

  emptyState.classList.add("d-none");
  resultInfo.textContent =
    visibleDocuments.length + " document(s) dikh rahe hain (total " +
    allDocuments.length + ")";

  // (2) Documents hain, par search/filter se koi match nahi hua
  if (visibleDocuments.length === 0) {
    documentGrid.classList.add("d-none");
    showNoResultsMessage();
    return;
  }

  // (3) Results dikhao
  documentGrid.classList.remove("d-none");
  visibleDocuments.forEach(function (doc) {
    documentGrid.appendChild(createDocumentCard(doc));
  });
}

// Database se documents padhke poora dashboard refresh karta hai
async function showDocuments() {
  try {
    const allRecords = await getAllDocuments();

    // Sirf wahi records lo jinme asli file (fileBlob) hai
    allDocuments = allRecords.filter(function (doc) {
      return doc.fileBlob;
    });

    // Sabse naya document sabse pehle (ISO date text sort ho jata hai)
    allDocuments.sort(function (a, b) {
      return b.dateAdded.localeCompare(a.dateAdded);
    });

    updateStats(allDocuments);
    showRecentList(allDocuments);
    refreshView();   // filters lagake list dikhao
  } catch (error) {
    showMessage("Documents load nahi ho paye: " + getErrorText(error), "danger");
  }
}

// ====================================================
// PART 8: FILE IMPORT
// ====================================================

// File ko check karta hai.
// Problem ho to uska message deta hai. Sab theek ho to "" (khali) deta hai.
function checkFile(file, existingDocuments) {
  const extension = getExtension(file.name);

  if (file.size === 0) {
    return "File khali hai (0 bytes).";
  }

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return "Ye file type supported nahi hai. Sirf PDF, PNG, JPG, JPEG aur TXT allowed hain.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "File bahut badi hai (" + formatSize(file.size) + "). Ek file ki limit 20 MB hai.";
  }

  // Same naam + same size = shayad pehle se import ho chuki hai
  const isDuplicate = existingDocuments.some(function (doc) {
    return doc.originalName === file.name && doc.size === file.size;
  });
  if (isDuplicate) {
    return "Ye file pehle se import ho chuki hai.";
  }

  // Total storage limit check
  const usedBytes = getTotalSize(existingDocuments);
  if (usedBytes + file.size > MAX_TOTAL_STORAGE) {
    const freeBytes = Math.max(0, MAX_TOTAL_STORAGE - usedBytes);
    return "Storage limit (" + STORAGE_LIMIT_TEXT + ") poori ho jayegi. Sirf " +
      formatSize(freeBytes) + " bacha hai. Kuch purane documents delete karo.";
  }

  return "";
}

// File se ek record banata hai (jo IndexedDB mein jayega)
function makeRecord(file) {
  return {
    name: file.name,                       // display naam (rename se badlega)
    originalName: file.name,               // asli naam kabhi nahi badlega
    type: file.type || "unknown",
    extension: getExtension(file.name),
    size: file.size,
    category: "Other",
    tags: [],
    dateAdded: new Date().toISOString(),
    lastOpened: null,
    favorite: false,
    notes: "",
    fileBlob: file                         // ASLI FILE (File ek Blob hi hota hai)
  };
}

// Import chal raha hai ya nahi: loading box dikhata hai, buttons band karta hai
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

// Selected files ko ek-ek karke import karta hai
async function importFiles(files) {

  // Khali selection
  if (files.length === 0) {
    showMessage("Koi file select nahi hui.", "warning");
    return;
  }

  setImporting(true);
  let savedCount = 0;

  try {
    // Pehle se saved documents (duplicate aur storage check ke liye)
    const existingDocuments = await getAllDocuments();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      importStatusText.textContent =
        "Import ho raha hai: " + (i + 1) + " / " + files.length;

      // Check karo. Problem ho to bata do (chup-chap skip nahi karenge)
      const problem = checkFile(file, existingDocuments);
      if (problem !== "") {
        showMessage(file.name + ": " + problem, "warning");
        continue;
      }

      // Save karo
      try {
        const record = makeRecord(file);
        record.id = await addDocument(record);
        existingDocuments.push(record);   // taaki same batch mein duplicate/storage sahi gine
        savedCount = savedCount + 1;
      } catch (error) {
        showMessage(file.name + " save nahi hui: " + getErrorText(error), "danger");

        // Browser ki storage full hai to baaki files bhi fail hongi, isliye ruk jao
        if (error && error.name === "QuotaExceededError") {
          showMessage("Storage full hai, baaki files import nahi ki gayi.", "danger");
          break;
        }
      }
    }
  } catch (error) {
    showMessage("Import nahi ho paya: " + getErrorText(error), "danger");
  }

  setImporting(false);

  // Success message sirf tab, jab sach mein kuch save hua ho
  if (savedCount > 0) {
    showMessage(savedCount + " document(s) save ho gaye.", "success");
  }

  await showDocuments();
}

// Import button dabane par file chooser kholo
importButtons.forEach(function (button) {
  button.addEventListener("click", function () {
    fileInput.click();
  });
});

// File choose hone par import shuru karo
fileInput.addEventListener("change", function () {
  const selectedFiles = Array.from(fileInput.files);
  fileInput.value = "";   // reset, taaki wahi file dobara choose ho sake
  importFiles(selectedFiles);
});

// ====================================================
// PART 9: ORGANIZATION (favorite, delete, edit)
// ====================================================

// Jab document database mein na mile (jaise doosre tab mein delete ho gaya)
async function showMissingDocument() {
  showMessage("Ye document nahi mila. Shayad delete ho chuka hai.", "danger");
  await showDocuments();
}

// ---------- Favorite ----------

// Favorite ON/OFF karta hai aur database mein save karta hai
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
    showMessage("Favorite change nahi hua: " + getErrorText(error), "danger");
  }
}

// ---------- Delete ----------

// Pehle confirmation poochta hai, phir permanently delete karta hai
async function deleteWithConfirm(id, name) {
  const sure = confirm(
    '"' + name + '" ko permanently delete karna hai? Ye wapas nahi aayega.'
  );
  if (!sure) {
    return;
  }

  try {
    await deleteDocument(id);
    showMessage("Document delete ho gaya.", "success");
    await showDocuments();
  } catch (error) {
    showMessage("Delete nahi hua: " + getErrorText(error), "danger");
  }
}

// ---------- Edit popup ----------

// Popup mein galti ka message dikhata hai
function showEditError(text) {
  editError.textContent = text;
  editError.classList.remove("d-none");
}

// "jaise: a, b , a" -> ["a", "b"]  (spaces hatao, khali hatao, duplicate hatao)
function parseTags(text) {
  const tags = [];

  text.split(",").forEach(function (part) {
    const tag = part.trim();
    if (tag === "") {
      return;   // khali tag chhod do
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

// Popup kholta hai aur document ki current details bharta hai
async function openEditModal(id) {
  try {
    const record = await getDocumentById(id);
    if (!record) {
      await showMissingDocument();
      return;
    }

    editingId = id;
    editError.classList.add("d-none");

    editName.value = record.name;
    editTags.value = (record.tags || []).join(", ");
    editNotes.value = record.notes || "";

    // Category list mein na ho (kharab record) to "Other" maano
    if (categories.includes(record.category)) {
      editCategory.value = record.category;
    } else {
      editCategory.value = "Other";
    }

    editModal.show();
  } catch (error) {
    showMessage("Edit popup nahi khul paya: " + getErrorText(error), "danger");
  }
}

// "Save changes" dabane par: check karo, phir database mein save karo
async function saveEdit() {
  const newName = editName.value.trim();
  const newTags = parseTags(editTags.value);

  // --- Checks ---
  if (newName === "") {
    showEditError("Document ka naam khali nahi ho sakta.");
    return;
  }

  if (newTags.length > MAX_TAGS) {
    showEditError("Max " + MAX_TAGS + " tags allowed hain. Aapne " + newTags.length + " likhe hain.");
    return;
  }

  const tooLongTag = newTags.find(function (tag) {
    return tag.length > MAX_TAG_LENGTH;
  });
  if (tooLongTag) {
    showEditError("Tag bahut lamba hai: \"" + tooLongTag + "\". Max " + MAX_TAG_LENGTH + " letters.");
    return;
  }

  // --- Save ---
  editSaveButton.disabled = true;   // double-click se bachne ke liye

  try {
    const record = await getDocumentById(editingId);
    if (!record) {
      editModal.hide();
      await showMissingDocument();
      return;
    }

    // Sirf ye 4 cheezein badalti hain. fileBlob aur originalName waise hi rehte hain.
    record.name = newName;
    record.category = editCategory.value;
    record.tags = newTags;
    record.notes = editNotes.value.trim();

    await updateDocument(record);

    editModal.hide();
    showMessage("Changes save ho gaye.", "success");
    await showDocuments();
  } catch (error) {
    showEditError("Save nahi hua: " + getErrorText(error));
  }

  editSaveButton.disabled = false;
}

editSaveButton.addEventListener("click", saveEdit);

// Name ya tags box mein Enter dabane par bhi save ho jaye
[editName, editTags].forEach(function (input) {
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      saveEdit();
    }
  });
});

// Popup khulte hi cursor naam wale box mein aa jaye (keyboard ke liye)
editModalElement.addEventListener("shown.bs.modal", function () {
  editName.focus();
});

// ====================================================
// PART 10: PREVIEW (NAYA - PHASE 6)
// ====================================================

// Preview area mein ek simple message dikhata hai
function showPreviewMessage(text) {
  previewArea.appendChild(makeElement("p", "preview-message mb-0", text));
}

// File information list mein ek row jodta hai
function addInfoRow(label, value) {
  previewInfo.appendChild(makeElement("dt", "info-label", label));
  previewInfo.appendChild(makeElement("dd", "info-value", value));
}

// Popup ke right side mein file ki details bharta hai
function fillPreviewInfo(record) {
  previewInfo.innerHTML = "";

  addInfoRow("Name", record.name);
  addInfoRow("Original file name", record.originalName);
  addInfoRow("Type", record.extension.toUpperCase() + " (" + record.type + ")");
  addInfoRow("Size", formatSize(record.size));
  addInfoRow("Category", record.category);
  addInfoRow("Added on", formatDateTime(record.dateAdded));

  if (record.lastOpened) {
    addInfoRow("Pichli baar khola", formatDateTime(record.lastOpened));
  } else {
    addInfoRow("Pichli baar khola", "Pehli baar khol rahe ho");
  }

  const tagsText = (record.tags && record.tags.length > 0) ? record.tags.join(", ") : "-";
  addInfoRow("Tags", tagsText);
  addInfoRow("Notes", record.notes ? record.notes : "-");
}

// ---------- Image preview ----------

function showImagePreview(record) {
  // Blob se temporary URL banta hai. Popup band hone par revoke karenge.
  currentObjectUrl = URL.createObjectURL(record.fileBlob);

  const image = makeElement("img", "preview-image");
  image.alt = record.name;

  // Image kharab ho to toota hua icon nahi, saaf message dikhao
  image.addEventListener("error", function () {
    previewArea.innerHTML = "";
    showPreviewMessage("Ye image khul nahi paayi. File kharab ho sakti hai. Aap neeche se download kar sakte ho.");
  });

  image.src = currentObjectUrl;
  previewArea.appendChild(image);
}

// ---------- TXT preview ----------

async function showTextPreview(blob, token) {
  const text = await blob.text();

  // Agar tab tak popup band/badal gaya ho, to kuch mat karo
  if (token !== previewToken) {
    return;
  }

  // <pre> mein textContent: text kabhi HTML ki tarah nahi chalega (safe)
  const box = makeElement("pre", "preview-text");
  box.textContent = text.length > MAX_TEXT_PREVIEW ? text.slice(0, MAX_TEXT_PREVIEW) : text;
  previewArea.appendChild(box);

  if (text.length > MAX_TEXT_PREVIEW) {
    previewArea.appendChild(
      makeElement(
        "p",
        "small text-muted mt-2 mb-0",
        "Sirf pehle " + MAX_TEXT_PREVIEW + " characters dikhaye gaye hain. Poori file download karke dekho."
      )
    );
  }
}

// ---------- PDF preview ----------

// PDF toolbar (Previous / Page X of Y / Next) ko update karta hai
function updatePdfToolbar() {
  if (currentPdf === null) {
    return;
  }

  pdfPageLabel.textContent = "Page " + currentPageNumber + " / " + currentPdf.numPages;
  pdfPrevButton.disabled = isRenderingPage || currentPageNumber <= 1;
  pdfNextButton.disabled = isRenderingPage || currentPageNumber >= currentPdf.numPages;
}

// PDF ka ek page canvas par banata hai
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
    // Popup band ho chuka ho to error dikhane ki zaroorat nahi
    if (currentPdf === pdf) {
      showMessage("PDF ka page nahi dikh paya: " + getErrorText(error), "danger");
    }
  }

  if (currentPdf === pdf) {
    isRenderingPage = false;
    updatePdfToolbar();
  }
}

async function showPdfPreview(blob, token) {
  if (!window.pdfjsLib) {
    throw new Error("PDF.js load nahi hua. Internet connection check karo.");
  }

  // File ka data padho aur PDF.js se kholo
  const data = await blob.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;

  // Agar tab tak popup band/badal gaya ho, to is PDF ko band kar do
  if (token !== previewToken) {
    pdf.destroy();
    return;
  }

  currentPdf = pdf;
  currentPageNumber = 1;
  isRenderingPage = false;

  // Toolbar: Previous, Page label, Next
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

// Preview ki galti ke liye simple message
function getPreviewErrorText(error) {
  if (error && error.name === "PasswordException") {
    return "Ye PDF password-protected hai, isliye preview nahi ho sakta. Download karke apne PDF viewer mein kholo.";
  }
  if (error && error.name === "InvalidPDFException") {
    return "Ye PDF kharab ya invalid hai, isliye preview nahi ho sakta. Aap neeche se file download kar sakte ho.";
  }
  return "Preview nahi ban paya: " + getErrorText(error) + " Aap file download kar sakte ho.";
}

// File type ke hisaab se sahi preview dikhata hai
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
      // Kisi aur type ke liye: toota hua preview nahi, saaf message
      showPreviewMessage("Is file type ka preview available nahi hai. Details dekho aur neeche se download karo.");
    }
  } catch (error) {
    if (token !== previewToken) {
      return;   // popup pehle hi band ho chuka
    }
    previewArea.innerHTML = "";
    showPreviewMessage(getPreviewErrorText(error));
  }
}

// Preview popup kholta hai
async function openPreview(id) {
  try {
    const record = await getDocumentById(id);
    if (!record) {
      await showMissingDocument();
      return;
    }
    if (!record.fileBlob) {
      showMessage("Is document ki file kharab ya missing hai, preview nahi ho sakta.", "danger");
      return;
    }

    previewToken = previewToken + 1;
    const myToken = previewToken;
    previewRecord = record;

    previewTitle.textContent = record.name;
    fillPreviewInfo(record);
    previewModal.show();

    await renderPreview(record, myToken);

    // Preview ke baad "lastOpened" save karo (Recent view isi se chalta hai)
    await markAsOpened(id);
  } catch (error) {
    showMessage("Preview nahi khul paya: " + getErrorText(error), "danger");
  }
}

// lastOpened ko abhi ka time karta hai. Fail ho to preview ko nahi rokta.
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
    console.warn("lastOpened save nahi hua:", error);
  }
}

// Popup band hone par safai: temporary URL revoke, PDF band, state reset
previewModalElement.addEventListener("hidden.bs.modal", function () {
  previewToken = previewToken + 1;   // chalte hue purane kaam ab ruk jayenge

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

// Download ka file naam: display naam + (agar extension na ho to) extension
function getDownloadName(record) {
  if (getExtension(record.name) === record.extension) {
    return record.name;
  }
  return record.name + "." + record.extension;
}

// Asli saved file download karta hai (rename sirf naam badalta hai, content nahi)
function downloadCurrentFile() {
  if (previewRecord === null) {
    return;
  }

  const url = URL.createObjectURL(previewRecord.fileBlob);

  const link = document.createElement("a");
  link.href = url;
  link.download = getDownloadName(previewRecord);
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Thodi der baad temporary URL revoke kar do
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

downloadButton.addEventListener("click", downloadCurrentFile);

// ====================================================
// PART 11: PAGE START HONE PAR
// ====================================================

// Database kholta hai, phir saved documents dikhata hai
async function startDatabase() {
  try {
    await openDatabase();
    await showDocuments();
  } catch (error) {
    dbError.textContent =
      "Database nahi khul paya: " + getErrorText(error) +
      " Documents save ya dikhaye nahi ja sakte.";
    dbError.classList.remove("d-none");

    // Database nahi hai to import band
    importButtons.forEach(function (button) {
      button.disabled = true;
    });
  }
}

showCategoryButtons();
fillCategoryDropdown();
categoryCount.textContent = categories.length;   // 6 categories (list se count)
startDatabase();

console.log("DocuNest: Phase 6 script loaded.");