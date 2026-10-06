let notes = [
    { id: 1, text: "Buy milk and bread", category: "personal" },
    { id: 2, text: "Finish the Day 3 assignment", category: "study" },
    { id: 3, text: "Email the project report to Grace", category: "work" },
    { id: 4, text: "Revise JavaScript arrays", category: "study" },
    { id: 5, text: "Call mum", category: "personal" },
];


// 1. Search notes
function searchNotes(word) {
    return notes.filter(note =>
        note.text.toLowerCase().includes(word.toLowerCase())
    );
}

console.log(searchNotes("javascript"));
// Expected: [{ id: 4, text: "Revise JavaScript arrays", category: "study" }]

console.log(searchNotes("python"));
// Expected: []


// 2. Find the longest note
function longestNote() {
    if (notes.length === 0) {
        return null;
    }

    let longest = notes[0];

    for (let note of notes) {
        if (note.text.length > longest.text.length) {
            longest = note;
        }
    }

    return longest;
}

console.log(longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }

let savedNotes = notes;
notes = [];

console.log(longestNote());
// Expected: null

notes = savedNotes;


// 3. Count notes by category
function countByCategory() {
    let counts = {};

    for (let note of notes) {
        if (counts[note.category] === undefined) {
            counts[note.category] = 0;
        }

        counts[note.category]++;
    }

    return counts;
}

console.log(countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }

let originalNotes = notes;
notes = [];

console.log(countByCategory());
// Expected: {}

notes = originalNotes;


// 4. Get summary
function getSummary() {
    let counts = countByCategory();
    let noteWord = notes.length === 1 ? "note" : "notes";

    return `${notes.length} ${noteWord}: ${counts.personal || 0} personal, ${counts.work || 0} work, ${counts.study || 0} study.`;
}

console.log(getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."

let backupNotes = notes;
notes = [backupNotes[0]];

console.log(getSummary());
// Expected: "1 note: 1 personal, 0 work, 0 study."

notes = backupNotes;


// 5. Check for duplicate
function isDuplicate(text) {
    return notes.some(note =>
        note.text.trim().toLowerCase() === text.trim().toLowerCase()
    );
}

console.log(isDuplicate("  BUY MILK AND BREAD  "));
// Expected: true

console.log(isDuplicate("Buy eggs"));
// Expected: false


// 6. Add a note
function addNote(text, category) {

    if (text.trim().length < 1 || text.trim().length > 200) {
        console.log("Note must be between 1 and 200 characters.");
        return false;
    }

    if (isDuplicate(text)) {
        console.log("Note already exists.");
        return false;
    }

    if (!["personal", "work", "study"].includes(category)) {
        console.log("Invalid category.");
        return false;
    }

    let newNote = {
        id: notes.length + 1,
        text: text.trim(),
        category: category
    };

    notes.push(newNote);

    return true;
}

console.log(addNote("Prepare for the JavaScript test", "study"));
// Expected: true

console.log(addNote("  Buy milk and bread  ", "personal"));
// Expected: false — Note already exists.