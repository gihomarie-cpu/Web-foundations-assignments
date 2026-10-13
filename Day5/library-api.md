# Library Books REST API Design

## Project Overview

This REST API allows clients to list books, retrieve individual books, create new books, update existing books, delete books and search for books by author.

**Base URL:** `/api`

**Resource:** `/api/books`

### 1. List All Books

- **Method:** GET
- **Path:** `/api/books`
- **Description:** Returns a list of all books in the library.
- **Example request body:** None.
- **Success status:** `200 OK`

### 2. Get One Book

- **Method:** GET
- **Path:** `/api/books/15`
- **Description:** Returns the details of the book whose ID is 15.
- **Example request body:** None.
- **Success status:** `200 OK`

### 3. Create a Book

- **Method:** POST
- **Path:** `/api/books`
- **Description:** Creates a new book in the library.

**Example request body:**

```json
{
  "title": "Introduction to JavaScript",
  "author": "Jane Smith",
  "publishedYear": 2025,
  "category": "Programming"
}
```

- **Success status:** `201 Created`

### 4. Update a Book

- **Method:** PUT
- **Path:** `/api/books/15`
- **Description:** Replaces the editable details of the book whose ID is 15.

**Example request body:**

```json
{
  "title": "Advanced JavaScript",
  "author": "Jane Smith",
  "publishedYear": 2026,
  "category": "Programming"
}
```

- **Success status:** `200 OK`

### 5. Delete a Book

- **Method:** DELETE
- **Path:** `/api/books/15`
- **Description:** Deletes the book whose ID is 15.
- **Example request body:** None.
- **Success status:** `204 No Content`

### 6. List Books by Author

- **Method:** GET
- **Path:** `/api/books?author=Jane%20Smith`
- **Description:** Returns books written by the specified author using the `author` query parameter.
- **Example request body:** None.
- **Success status:** `200 OK`

### Error Status Codes

#### 400 Bad Request

- **Description:** The request contains invalid data or parameters.
- **Example:** A client attempts to create a book without a required title.
- **Example response:**

```json
{
  "error": "Book title is required."
}
```

#### 404 Not Found

- **Description:** The requested resource does not exist.
- **Example:** A client requests `GET /api/books/9999`, but no book with ID 9999 exists.
- **Example response:**

```json
{
  "error": "Book not found."
}
```

### Summary

This REST API uses HTTP methods to perform CRUD operations:

- **Create:** POST
- **Read:** GET
- **Update:** PUT
- **Delete:** DELETE

The API uses resource-based URLs, query parameters for author searches and HTTP status codes to communicate the result of each request.
