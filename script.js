// DocuNest - Phase 3 script
// Phase 2 ka UI code + IndexedDB ka naya code.

// ====================================================
// PART 1: DATA
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

// Phase 3 test box ke elements
const dbStatus = document.getElementById("db-status");
const saveTestButton = document.getElementById("save-test-button");
const showTestButton = document.getElementById("show-test-button");
const clearTestButton = document.getElementById("clear-test-button");
const testOutput = document.getElementById("test-output");

// ====================================================
// PART 3: MESSAGES
// ====================================================

// Success / error / info message dikhata hai (5 second baad hat jata hai)
// type: "success", "danger", "warning" ya "info"
function showMessage(text, type) {
  const box = document.createElement("div");
  box.className = "alert alert-" + type + " alert-dismissible fade show";
  box.setAttribute("role", "alert");

  // textContent use kiya hai taaki text kabhi HTML ki tarah na chale (safe)
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
// PART 6: IMPORT BUTTON
// ====================================================

// Abhi upload nahi bana, isliye sach batate hain
function handleImportClick() {
  showMessage("Import feature Phase 4 mein banayenge. Abhi ye sirf design hai.", "info");
}

importButtons.forEach(function (button) {
  button.addEventListener("click", handleImportClick);
});

// ====================================================
// PART 7: INDEXEDDB (NAYA - PHASE 3)
// ====================================================

const DB_NAME = "DocuNestDB";     // database ka naam
const DB_VERSION = 1;             // version number
const STORE_NAME = "documents";   // shelf (object store) ka naam

// "db" mein open database aayega. Shuru mein khali (null) hai.
let db = null;

// ---------- Database kholna ----------

// Database kholta hai. Agar pehli baar hai to bana bhi deta hai.
// Promise = "abhi result nahi hai, thodi der mein milega"
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

        // Index = search/filter ko tez karne ke liye
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

// ---------- Transaction shuru karna ----------

// IndexedDB mein har kaam "transaction" ke andar hota hai.
// mode: "readonly" (sirf padhna) ya "readwrite" (likhna / delete)
function startTransaction(mode) {
  if (db === null) {
    throw new Error("Database abhi ready nahi hai.");
  }
  return db.transaction(STORE_NAME, mode);
}

// ---------- Record save karna ----------

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

// ---------- Saare records padhna ----------

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

// ---------- Saare records delete karna (sirf test ke liye) ----------

function deleteAllDocuments() {
  return new Promise(function (resolve, reject) {
    const transaction = startTransaction("readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();

    transaction.oncomplete = function () {
      resolve();
    };

    transaction.onabort = function () {
      reject(transaction.error);
    };
  });
}

// ---------- Error ka simple message ----------

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
// PART 8: PHASE 3 TEST BOX KE BUTTONS
// ====================================================

// Test record save karta hai
// async/await = "ruko, jab tak result na aaye, phir aage badho"
async function handleSaveTest() {
  try {
    const testRecord = {
      name: "Test Record",
      category: "Other",
      dateAdded: new Date().toISOString()
    };

    const newId = await addDocument(testRecord);
    showMessage("Test record save ho gaya. ID: " + newId, "success");
    await handleShowTest();   // list refresh karo
  } catch (error) {
    showMessage("Save nahi hua: " + getErrorText(error), "danger");
  }
}

// Saved records ko list mein dikhata hai
async function handleShowTest() {
  try {
    const records = await getAllDocuments();

    testOutput.innerHTML = "";

    if (records.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "text-muted";
      emptyItem.textContent = "Database mein koi record nahi hai.";
      testOutput.appendChild(emptyItem);
      return;
    }

    records.forEach(function (record) {
      const item = document.createElement("li");
      // textContent: safe tareeka text dikhane ka
      item.textContent =
        "ID " + record.id + " | " + record.name +
        " | " + record.category + " | " + record.dateAdded;
      testOutput.appendChild(item);
    });
  } catch (error) {
    showMessage("Records nahi padhe ja sake: " + getErrorText(error), "danger");
  }
}

// Saare test records delete karta hai
async function handleClearTest() {
  const sure = confirm("Saare test records delete karne hain?");
  if (!sure) {
    return;
  }

  try {
    await deleteAllDocuments();
    showMessage("Saare test records delete ho gaye.", "success");
    await handleShowTest();
  } catch (error) {
    showMessage("Delete nahi hua: " + getErrorText(error), "danger");
  }
}

saveTestButton.addEventListener("click", handleSaveTest);
showTestButton.addEventListener("click", handleShowTest);
clearTestButton.addEventListener("click", handleClearTest);

// ====================================================
// PART 9: PAGE START HONE PAR
// ====================================================

// Database kholta hai aur status dikhata hai
async function startDatabase() {
  try {
    await openDatabase();
    dbStatus.textContent = "Database ready hai.";
    dbStatus.style.color = "green";
  } catch (error) {
    dbStatus.textContent = "Database nahi khul paya: " + getErrorText(error);
    dbStatus.style.color = "red";

    // Jab database hi nahi hai, to test buttons band kar do
    saveTestButton.disabled = true;
    showTestButton.disabled = true;
    clearTestButton.disabled = true;
  }
}

showCategoryButtons();
categoryCount.textContent = categories.length;   // 6 categories (list se count)
startDatabase();

console.log("DocuNest: Phase 3 script loaded.");