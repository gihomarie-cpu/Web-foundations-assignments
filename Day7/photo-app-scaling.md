Day 7 — SnapShare Scaling Plan

The goal is to explain how SnapShare, a photo-sharing application, could handle millions of users without becoming slow or running out of storage. We will calculate the expected workload, design the architecture, explain each component, and discuss the engineering trade-offs.
1. Assumptions and workload calculations

We are given these starting facts:
Item	Given value
Registered users	10,000,000
Daily active users	10%
Photos uploaded per active user per day	1
Feed pages viewed per active user per day	50
Average original photo size	2 MB
Average thumbnail size	50 KB
Peak traffic multiplier	5× average
Step 1: Calculate daily active users
Daily active users (DAU) are the registered users who use SnapShare each day.
\[
10{,}000{,}000 \times 0.10 = 1{,}000{,}000
\]

Daily active users = 1 million.
Step 2: Calculate photo uploads per second
Each active user uploads one photo per day.
\[
1{,}000{,}000 \times 1
= 1{,}000{,}000 \text{ uploads/day}
\]

There are 86,400 seconds in a day.
\[
\frac{1{,}000{,}000}{86{,}400}
\approx 11.57
\]

Average upload rate ≈ 11.6 photos per second.
Assuming uploads follow the same 5× peak multiplier:
\[
11.57 \times 5 \approx 57.87
\]

Peak upload rate ≈ 58 photos per second.
Step 3: Calculate feed views per second
Each active user views 50 feed pages per day.
\[
1{,}000{,}000 \times 50
= 50{,}000{,}000 \text{ feed views/day}
\]

Average feed views per second:
\[
\frac{50{,}000{,}000}{86{,}400}
\approx 578.70
\]

Peak feed views per second:
\[
578.70 \times 5 \approx 2{,}893.52
\]

Average feed views ≈ 579 per second; peak ≈ 2,894 per second.
These are page-request estimates, not individual photo requests. One feed page may display multiple photos, and those photos can generate additional image requests.
Step 4: Calculate storage per year
Assumptions for this estimate:
- All uploads are retained for one year.
- Each uploaded photo produces one thumbnail.
- 1 MB = 1,000 KB and 1 TB = 1,000 GB.
- We exclude database metadata, backups, replication, and temporary files from the base estimate.
Original photos
\[
1{,}000{,}000 \times 2\text{ MB}
= 2{,}000{,}000\text{ MB/day}
\]

That is 2 TB per day.
\[
2\text{ TB} \times 365 = 730\text{ TB/year}
\]

Thumbnails
\[
1{,}000{,}000 \times 50\text{ KB}
= 50\text{ GB/day}
\]

\[
50\text{ GB} \times 365 = 18.25\text{ TB/year}
\]

Estimated annual storage
Original photos
730 TB

Thumbnails
18.25 TB


Total per year
748.25 TB

This is newly generated storage per year, not the total accumulated storage across multiple years.

2. Is SnapShare read-heavy or write-heavy?

SnapShare is read-heavy under these assumptions.
- Uploads: 1 million per day.
- Feed views: 50 million per day.
Feed views occur 50 times as often as photo uploads. This means the system must efficiently serve large numbers of feed requests and image downloads.
The design should therefore use a CDN to deliver photos close to users, caching to reduce repeated database work, and a database read replica to handle read queries without sending all of them to the primary database.

3. Why photos should not be stored in the database


Original photos and thumbnails should be stored in object storage, while the database stores their metadata and storage keys or URLs.
Storing large photo files directly in the relational database would increase database size, backup time, and the cost of serving image traffic. Object storage is designed to store large volumes of files efficiently and can work with a CDN to deliver those files quickly.
For example, the database might store:
- Photo ID
- User ID
- Caption
- Upload timestamp
- Original photo storage key
- Thumbnail storage key
The actual image bytes live in object storage rather than inside the database records.


4. Architecture diagram


                         SNAPSHARE ARCHITECTURE

 Users / Mobile Apps / Browsers
              |
              v
       +--------------+
       |     CDN      | <------ Object Storage
       +--------------+           (Originals + Thumbnails)
              |                         ^
              v                         |
       +--------------+                 |
       | Load Balancer|                 |
       +--------------+                 |
              |                         |
       +------+------+                  |
       |             |                  |
       v             v                  |
 +------------+ +------------+          |
 | App Server | | App Server |          |
 +------------+ +------------+          |
       |             |                  |
       +------+------|------------------+
              |
       +------+------+
       |             |
       v             v
 +------------+ +----------------+
 |   Cache    | | Primary Database|
 +------------+ +----------------+
                      |
                      | Replication
                      v
               +----------------+
               |  Read Replica  |
               +----------------+

 Photo upload processing:
 App Server
      |
      +------> Object Storage (original photo)
      |
      +------> Queue
                  |
                  v
           +----------------+
           | Thumbnail Worker|
           +----------------+
                  |
                  v
           Object Storage
           (thumbnail file)

The diagram shows the main services and how requests and files move between them. In a production deployment, the CDN can serve cached images directly from object storage, while the app servers handle authentication, feed logic, metadata, and upload coordination.

5. What each component does

Component	Problem it solves
CDN (Content Delivery Network)	Reduces image-loading time by caching and delivering photos from locations close to users.
Load balancer	Distributes incoming requests across multiple app servers so one server does not become overloaded.
App servers	Run the application logic for authentication, uploads, feed generation, and metadata operations.
Cache	Keeps frequently requested data, such as feed results, in fast memory to reduce repeated database queries.
Primary database	Stores durable structured information, including users, follows, photo metadata, and feed-related records.
Read replica	Handles suitable read queries separately from the primary database to reduce read load.
Object storage	Stores the original photos and thumbnail files without placing their large binary contents in database rows.
Queue	Holds thumbnail-generation jobs so uploading a photo does not need to wait for image processing.
Thumbnail worker	Processes queued jobs to create smaller image versions and saves the thumbnails to object storage.

6. Photo upload flow


1. User selects a photo. The application checks basic requirements such as file type and size.
2. The app server authorizes the request. It verifies the user's identity and checks that the user is permitted to upload.
3. The original photo is uploaded to object storage. The application stores the resulting object key or storage reference.
4. The primary database records the metadata. The record includes the user ID, caption, timestamp, original photo key, and processing status.
5. A thumbnail job is placed on the queue. The job contains the photo's storage reference and the information needed to process it.
6. The app confirms the upload. The user can be told that the photo was uploaded while thumbnail generation continues in the background.
7. A thumbnail worker consumes the job. It reads the original image, generates the 50 KB thumbnail target where practical, and stores the thumbnail in object storage.
8. The worker updates the processing status. The database can record that the thumbnail is ready, and the application can expose it in the feed.
9. Users view the photo through the CDN. The CDN serves cached thumbnails or originals, reducing repeated requests to the application servers and object storage.
The upload and thumbnail operations should be designed to tolerate retries. For example, if a worker fails, the queue can make the job available again without creating duplicate metadata or inconsistent photo records.

7. Engineering trade-offs


Trade-off 1: Cache speed vs. data freshness
Caching feed results reduces database load and improves response times. However, a cached feed may not immediately reflect a new upload, a changed caption, or a follow/unfollow action.