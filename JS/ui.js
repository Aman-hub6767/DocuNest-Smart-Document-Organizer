// DocuNest - ui.js
// Sidebar, search, filters and showing documents on the dashboard.

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