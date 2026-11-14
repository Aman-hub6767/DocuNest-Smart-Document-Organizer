// DocuNest - dom.js
// State variables and html elements. Must load after config.js and before the other files.

// ---------- state ----------

let db = null;
let allDocuments = [];          // all documents (details only)
let currentView = "all";        // "all", "favorites" or "recent"
let selectedCategory = "All";
let searchText = "";
let searchTimer = null;
let editingId = null;           // the document open in the edit popup

// preview popup
let previewRecord = null;       // details of the document being previewed
let previewFile = null;         // the real file being previewed
let previewToken = 0;           // changes with every preview, so old work can stop
let currentObjectUrl = null;    // temporary image address
let currentPdf = null;
let currentPageNumber = 1;
let isRenderingPage = false;
let pdfCanvas = null;
let pdfPrevButton = null;
let pdfNextButton = null;
let pdfPageLabel = null;

// ---------- html elements ----------

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
const typeBreakdown = document.getElementById("type-breakdown");
const recentList = document.getElementById("recent-list");
const emptyState = document.getElementById("empty-state");
const documentGrid = document.getElementById("document-grid");
const searchInput = document.getElementById("search-input");
const resultInfo = document.getElementById("result-info");
const noResults = document.getElementById("no-results");
const noResultsTitle = document.getElementById("no-results-title");
const noResultsText = document.getElementById("no-results-text");
const clearFiltersButton = document.getElementById("clear-filters-button");

const editModalElement = document.getElementById("edit-modal");
const editModal = new bootstrap.Modal(editModalElement);
const editError = document.getElementById("edit-error");
const editName = document.getElementById("edit-name");
const editCategory = document.getElementById("edit-category");
const editTags = document.getElementById("edit-tags");
const editNotes = document.getElementById("edit-notes");
const editSaveButton = document.getElementById("edit-save-button");

const previewModalElement = document.getElementById("preview-modal");
const previewModal = new bootstrap.Modal(previewModalElement);
const previewTitle = document.getElementById("preview-modal-title");
const previewArea = document.getElementById("preview-area");
const previewInfo = document.getElementById("preview-info");
const downloadButton = document.getElementById("download-button");

const backupModal = new bootstrap.Modal(document.getElementById("backup-modal"));
const backupSummary = document.getElementById("backup-summary");
const backupResult = document.getElementById("backup-result");
const exportButton = document.getElementById("export-button");
const restoreButton = document.getElementById("restore-button");
const restoreInput = document.getElementById("restore-input");

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
}