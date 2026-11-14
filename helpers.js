// DocuNest - helpers.js
// Small helper functions used by the other files.

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

function getErrorText(error) {
  if (error && error.name === "QuotaExceededError") {
    return "The browser storage is full. Delete some old documents and try again.";
  }
  if (error && error.message) {
    return error.message;
  }
  return "Something went wrong.";
}