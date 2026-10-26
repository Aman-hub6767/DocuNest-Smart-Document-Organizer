// DocuNest - Phase 4 script (100 MB storage limit ke saath)
// Phase 2 ka UI + Phase 3 ka IndexedDB + Phase 4 ka file import.

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
    description: "Aapke favorite documents yahan dikhenge."
  },
  recent: {
    title: "Recent Documents",
    description: "Haal hi mein khole gaye documents yahan dikhenge."
  },
  backup: {
    title: "Backup",
    description: "Documents ki details ka backup yahan se milega."
  }
};

// Import ke rules
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "txt"];
const MAX_FILE_SIZE = 100 * 1024 * 1024;       // ek file ki limit: 100 MB (bytes mein)

// NAYA: DocuNest ki total storage limit
const MAX_TOTAL_STORAGE = 100 * 1024 * 1024;    // 100 MB (bytes mein)
const STORAGE_LIMIT_TEXT = Math.round(MAX_TOTAL_STORAGE / (1024 * 1024)) + " MB";   // "100 MB"

// Abhi kaunsi category selected hai
let selectedCategory = "All";

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

// NAYA: Saare documents ka total size (bytes mein) jodta hai
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

// Menu item dabane par active highlight aur page title badalta hai
function selectNavItem(clickedItem) {
  navItems.forEach(function (item) {
    item.classList.remove("active");
  });
  clickedItem.classList.add("active");

  const viewName = clickedItem.dataset.view;
  pageTitle.textContent = pageInfo[viewName].title;
  pageDescription.textContent = pageInfo[viewName].description;

  closeSidebar();
}

navItems.forEach(function (item) {
  item.addEventListener("click", function (event) {
    event.preventDefault();   // link ko page reload karne se rokta hai
    selectNavItem(item);
  });
});

// ====================================================
// PART 5: CATEGORY BUTTONS
// ====================================================

// Category buttons banata hai: All, Education, Certificates, ...
function showCategoryButtons() {
  categoryFilters.innerHTML = "";

  const allNames = ["All"].concat(categories);

  allNames.forEach(function (name) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = name;

    if (name === selectedCategory) {
      button.classList.add("active");
    }

    button.addEventListener("click", function () {
      selectCategory(name);
    });

    categoryFilters.appendChild(button);
  });
}

// Category select karne par highlight badalta hai
// (Real filtering Phase 6 mein aayegi)
function selectCategory(name) {
  selectedCategory = name;
  showCategoryButtons();
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

// Ek record save karta hai. Naya id wapas deta hai.
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

// Ek document ka card banata hai
function createDocumentCard(doc) {
  const column = makeElement("div", "col-12 col-md-6 col-xl-4");
  const card = makeElement("div", "doc-card");

  // Left: file ka icon
  const iconBox = makeElement("div", "doc-icon");
  iconBox.appendChild(makeElement("i", "bi " + getIconClass(doc.extension)));

  // Right: naam, type + size, category + date
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

  // NAYA: storage card mein "used" aur "limit ka kitna percent" dikhao
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

// Document cards ka grid dikhata hai (ya empty state)
function showDocumentGrid(documents) {
  documentGrid.innerHTML = "";

  if (documents.length === 0) {
    emptyState.classList.remove("d-none");
    documentGrid.classList.add("d-none");
    return;
  }

  emptyState.classList.add("d-none");
  documentGrid.classList.remove("d-none");

  documents.forEach(function (doc) {
    documentGrid.appendChild(createDocumentCard(doc));
  });
}

// Database se documents padhke poora dashboard refresh karta hai
async function showDocuments() {
  try {
    const allRecords = await getAllDocuments();

    // Sirf wahi records lo jinme asli file (fileBlob) hai
    const documents = allRecords.filter(function (doc) {
      return doc.fileBlob;
    });

    // Sabse naya document sabse pehle (ISO date text sort ho jata hai)
    documents.sort(function (a, b) {
      return b.dateAdded.localeCompare(a.dateAdded);
    });

    updateStats(documents);
    showRecentList(documents);
    showDocumentGrid(documents);
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

  // NAYA: total storage limit check
  // Ab tak jitna use hua + ye nayi file > 100 MB ho jayega?
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
    name: file.name,                       // display naam (Phase 5 mein rename hoga)
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
// PART 9: PAGE START HONE PAR
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
categoryCount.textContent = categories.length;   // 6 categories (list se count)
startDatabase();

console.log("DocuNest: Phase 4 script loaded.");