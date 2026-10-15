
-- Day 6: School Database
-- Compatible with SQLite

PRAGMA foreign_keys = ON;

-- 1. Create the students table
CREATE TABLE students (
    student_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

-- 2. Create the courses table
CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    course_name TEXT NOT NULL,
    course_code TEXT NOT NULL UNIQUE
);

-- 3. Create the enrolments table
CREATE TABLE enrolments (
    enrolment_id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade REAL NOT NULL CHECK (grade >= 0 AND grade <= 100),

    FOREIGN KEY (student_id)
        REFERENCES students(student_id),

    FOREIGN KEY (course_id)
        REFERENCES courses(course_id),

    UNIQUE (student_id, course_id)
);

-- 4. Insert students
INSERT INTO students (student_id, name, email) VALUES
(1, 'Alice Johnson', 'alice@example.com'),
(2, 'Brian Smith', 'brian@example.com'),
(3, 'Clara Uwase', 'clara@example.com'),
(4, 'David Niyonsenga', 'david@example.com');

-- 5. Insert courses
INSERT INTO courses (course_id, course_name, course_code) VALUES
(1, 'Database Systems', 'CS301'),
(2, 'Web Development', 'CS302'),
(3, 'Software Engineering', 'CS303');

-- 6. Insert enrolments
INSERT INTO enrolments
    (enrolment_id, student_id, course_id, grade)
VALUES
(1, 1, 1, 85.0),
(2, 1, 2, 90.0),
(3, 2, 1, 76.0),
(4, 2, 3, 88.0),
(5, 3, 2, 92.0);

-- QUERY 1:
-- Find all courses taken by Alice Johnson
SELECT
    s.name AS student_name,
    c.course_name,
    e.grade
FROM students AS s
JOIN enrolments AS e
    ON s.student_id = e.student_id
JOIN courses AS c
    ON e.course_id = c.course_id
WHERE s.name = 'Alice Johnson';

-- QUERY 2:
-- Find all students enrolled in Database Systems
SELECT
    s.student_id,
    s.name,
    s.email,
    e.grade
FROM students AS s
JOIN enrolments AS e
    ON s.student_id = e.student_id
JOIN courses AS c
    ON e.course_id = c.course_id
WHERE c.course_name = 'Database Systems';

-- QUERY 3:
-- Count the students enrolled in each course
-- LEFT JOIN also includes courses with zero enrolments
SELECT
    c.course_name,
    COUNT(e.student_id) AS number_of_students
FROM courses AS c
LEFT JOIN enrolments AS e
    ON c.course_id = e.course_id
GROUP BY c.course_id, c.course_name
ORDER BY c.course_id;

-- QUERY 4:
-- Find students who have no enrolments
SELECT
    s.student_id,
    s.name,
    s.email
FROM students AS s
LEFT JOIN enrolments AS e
    ON s.student_id = e.student_id
WHERE e.student_id IS NULL;

-- QUERY 5:
-- Update Alice Johnson's Database Systems grade to 95
UPDATE enrolments
SET grade = 95.0
WHERE student_id = (
    SELECT student_id
    FROM students
    WHERE name = 'Alice Johnson'
)
AND course_id = (
    SELECT course_id
    FROM courses
    WHERE course_name = 'Database Systems'
);

-- Verify the updated grade
SELECT
    s.name AS student_name,
    c.course_name,
    e.grade
FROM enrolments AS e
JOIN students AS s
    ON e.student_id = s.student_id
JOIN courses AS c
    ON e.course_id = c.course_id
WHERE s.name = 'Alice Johnson'
  AND c.course_name = 'Database Systems';
