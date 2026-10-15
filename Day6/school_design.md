# School Database Design

## 1. Table descriptions

### Students

The `students` table stores information about each student. It contains `student_id` as the primary key, `name` as the student's full name, and `email` as the student's email address. The email field is unique and cannot be NULL, ensuring that every student has a required, distinct email address.

### Courses

The `courses` table stores information about the courses offered by the school. It contains `course_id` as the primary key, `course_name` as the course name, and `course_code` as a unique identifier for each course. The required fields cannot be NULL.

### Enrolments

The `enrolments` table records which students take which courses and the grades they receive. It contains `enrolment_id` as the primary key, `student_id` and `course_id` as foreign keys, and `grade` as the student's score. The grade must be between 0 and 100. A UNIQUE constraint on `(student_id, course_id)` prevents the same student from enrolling in the same course more than once.

## 2. Relationships between tables

The relationship between Students and Enrolments is one-to-many because one student can have multiple enrolment records, while each enrolment belongs to one student. The relationship between Courses and Enrolments is also one-to-many because one course can have multiple students enrolled in it, while each enrolment refers to one course.

Students and Courses have a many-to-many relationship. A student can take multiple courses, and each course can contain multiple students. The Enrolments table resolves this relationship by connecting the two tables through foreign keys. It also stores the grade associated with each student's enrolment in a particular course.

## 3. Recommended index

I would add an index on `enrolments(course_id)`. This index can improve queries that find students enrolled in a particular course or count the enrolments for each course. It is useful when the database grows and contains many enrolment records. The UNIQUE constraint on `(student_id, course_id)` already creates an index for that column combination, but it does not replace a separate index beginning with `course_id`.

## 4. SQL or NoSQL?

I would choose a relational SQL database, such as SQLite, for this school system. Students, courses, enrolments, and grades have clear relationships that can be represented using primary keys and foreign keys. SQL supports JOIN operations for retrieving related information, GROUP BY for counting students per course, and constraints for maintaining data integrity. These features help prevent duplicate enrolments and invalid references. A NoSQL database could also support a school system, but a relational database is a suitable and straightforward choice for this structured data and its relationships.
