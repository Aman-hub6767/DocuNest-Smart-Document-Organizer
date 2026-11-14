// DocuNest - db.js
// Everything that talks to IndexedDB.

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