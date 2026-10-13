
const loadButton = document.querySelector("#load-users");
const filterInput = document.querySelector("#filter-input");
const statusMessage = document.querySelector("#status");
const usersList = document.querySelector("#users-list");

let users = [];
let usersLoaded = false;

// Fetch users from the API
async function loadUsers() {
    loadButton.disabled = true;
    statusMessage.textContent = "Loading users...";
    usersList.replaceChildren();

    try {
        const response = await fetch(
            "https://jsonplaceholder.typicode.com/users"
        );

        // Check whether the HTTP response was successful
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        users = await response.json();
        usersLoaded = true;

        renderUsers(getFilteredUsers());

        statusMessage.textContent =
            `Successfully loaded ${users.length} users.`;

    } catch (error) {
        users = [];
        usersLoaded = false;
        usersList.replaceChildren();

        statusMessage.textContent =
            "Failed to load users. Please check your connection and try again.";

        console.error("Error loading users:", error);

    } finally {
        // Runs whether the request succeeds or fails
        loadButton.disabled = false;
    }
}

// Display any array of users
function renderUsers(list) {
    usersList.replaceChildren();

    if (list.length === 0) {
        if (usersLoaded) {
            const message = document.createElement("li");
            message.textContent = "No users match your filter.";
            usersList.appendChild(message);
        }

        return;
    }

    list.forEach(user => {
        const item = document.createElement("li");

        const name = document.createElement("h3");
        name.textContent = user.name;

        const email = document.createElement("p");
        email.textContent = `Email: ${user.email}`;

        const city = document.createElement("p");
        city.textContent = `City: ${user.address.city}`;

        const company = document.createElement("p");
        company.textContent = `Company: ${user.company.name}`;

        item.append(name, email, city, company);
        usersList.appendChild(item);
    });
}

// Return users matching the current search text
function getFilteredUsers() {
    const searchText = filterInput.value.trim().toLowerCase();

    return users.filter(user =>
        user.name.toLowerCase().includes(searchText)
    );
}

// Load users when the button is clicked
loadButton.addEventListener("click", loadUsers);

// Filter the stored array without making another API request
filterInput.addEventListener("input", function () {
    if (!usersLoaded) {
        return;
    }

    renderUsers(getFilteredUsers());
});