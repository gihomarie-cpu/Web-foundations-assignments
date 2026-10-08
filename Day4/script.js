const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");


// Update character and word counters
function updateCounts() {
    const text = noteText.value;
    const characters = text.length;

    // Count words
    const words = text.trim() === ""
        ? 0
        : text.trim().split(/\s+/).length;

    charCount.textContent = `${characters} / 200 characters`;
    wordCount.textContent = `${words} words`;

    // Reset counter classes
    charCount.classList.remove("warning", "over");

    // Add warning when over 180 characters
    if (characters > 180 && characters <= 200) {
        charCount.classList.add("warning");
    }

    // Add over when above 200 characters
    if (characters > 200) {
        charCount.classList.add("over");
    }
}


// Save draft whenever the user types
noteText.addEventListener("input", function () {
    updateCounts();

    localStorage.setItem("noteDraft", noteText.value);
});


// Clear the note
function clearNote() {
    noteText.value = "";

    updateCounts();

    localStorage.removeItem("noteDraft");
}


// Clear button
clearBtn.addEventListener("click", clearNote);


// Escape key clears the note
noteText.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
        clearNote();
    }
});


// Toggle dark mode
themeToggle.addEventListener("click", function () {
    document.body.classList.toggle("dark");

    if (document.body.classList.contains("dark")) {
        themeToggle.textContent = "Light mode";
        localStorage.setItem("theme", "dark");
    } else {
        themeToggle.textContent = "Dark mode";
        localStorage.setItem("theme", "light");
    }
});


// Restore saved data when the page loads
const savedDraft = localStorage.getItem("noteDraft");

if (savedDraft !== null) {
    noteText.value = savedDraft;
}


// Restore saved theme
const savedTheme = localStorage.getItem("theme");

if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeToggle.textContent = "Light mode";
} else {
    themeToggle.textContent = "Dark mode";
}


// Update counters after restoring the draft
updateCounts();