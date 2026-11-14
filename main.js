// DocuNest - main.js
// Starts the app. This file must load last.

async function startDatabase() {
  try {
    await openDatabase();
    await showDocuments();
  } catch (error) {
    dbError.textContent =
      "The database could not be opened: " + getErrorText(error) +
      " Documents cannot be saved or shown.";
    setVisible(dbError, true);

    importButtons.forEach(function (button) {
      button.disabled = true;
    });
  }
}

updateSupportedTypes();
showCategoryButtons();
fillCategoryDropdown();
showTypeBreakdown([]);
startDatabase();

console.log("DocuNest started.");