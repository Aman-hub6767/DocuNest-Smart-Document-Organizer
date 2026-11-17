// DocuNest - backup.js
// Export and restore of document details (not the real files).

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