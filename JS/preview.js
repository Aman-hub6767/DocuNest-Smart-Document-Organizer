// DocuNest - preview.js
// The preview popup: PDF, image, TXT, Markdown, DOCX and XLSX.

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