// DocuNest - edit.js
// Favorite, delete and the edit popup.

async function toggleFavorite(id) {
  try {
    const record = await getExistingRecord(id);
    if (record === null) {
      return;
    }
    record.favorite = !record.favorite;
    await updateDocument(record);
    await showDocuments();
  } catch (error) {
    showMessage("Could not change favorite: " + getErrorText(error), "danger");
  }
}

async function deleteWithConfirm(id, name) {
  if (!confirm('Delete "' + name + '" permanently? This cannot be undone.')) {
    return;
  }

  try {
    await deleteDocument(id);
    showMessage("Document deleted.", "success");
    await showDocuments();
  } catch (error) {
    showMessage("Could not delete: " + getErrorText(error), "danger");
  }
}

function showEditError(text) {
  editError.textContent = text;
  setVisible(editError, true);
}

async function openEditModal(id) {
  try {
    const record = await getExistingRecord(id);
    if (record === null) {
      return;
    }

    editingId = id;
    setVisible(editError, false);
    editSaveButton.disabled = false;

    editName.value = record.name;

    let tags = [];
    if (record.tags) {
      tags = record.tags;
    }
    editTags.value = tags.join(", ");

    editNotes.value = "";
    if (record.notes) {
      editNotes.value = record.notes;
    }

    editCategory.value = "Other";
    if (categories.includes(record.category)) {
      editCategory.value = record.category;
    }

    editModal.show();
  } catch (error) {
    showMessage("Could not open the edit popup: " + getErrorText(error), "danger");
  }
}

// returns a message if the input is not valid, or "" if it is fine
function findEditProblem(name, tags) {
  if (name === "") {
    return "The document name cannot be empty.";
  }
  if (tags.length > MAX_TAGS) {
    return "You can add at most " + MAX_TAGS + " tags. You entered " + tags.length + ".";
  }
  const longTag = tags.find(function (tag) {
    return tag.length > MAX_TAG_LENGTH;
  });
  if (longTag) {
    return "This tag is too long: \"" + longTag + "\". The limit is " + MAX_TAG_LENGTH + " characters.";
  }
  return "";
}

async function saveEdit() {
  if (editSaveButton.disabled) {
    return;   // a save is already running
  }

  const newName = editName.value.trim();
  const newTags = parseTags(editTags.value);
  const problem = findEditProblem(newName, newTags);
  if (problem !== "") {
    showEditError(problem);
    return;
  }

  editSaveButton.disabled = true;

  try {
    const record = await getExistingRecord(editingId);
    if (record === null) {
      editModal.hide();
      return;
    }

    // only these four things change. originalName and the file stay the same.
    record.name = newName;
    record.category = editCategory.value;
    record.tags = newTags;
    record.notes = editNotes.value.trim();

    await updateDocument(record);
    editModal.hide();
    showMessage("Changes saved.", "success");
    await showDocuments();
  } catch (error) {
    showEditError("Could not save: " + getErrorText(error));
  } finally {
    editSaveButton.disabled = false;   // finally always runs, so Save never stays disabled
  }
}

editSaveButton.addEventListener("click", saveEdit);

// Enter in the name or tags box also saves
[editName, editTags].forEach(function (input) {
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      saveEdit();
    }
  });
});

editModalElement.addEventListener("shown.bs.modal", function () {
  editName.focus();
});