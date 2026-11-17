// DocuNest - import.js
// Checking and saving imported files.

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