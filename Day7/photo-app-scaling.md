SnapShare Photo-App Scaling Plan

1. Assumptions

The following assumptions are used:

•
SnapShare has 10 million registered users.

•
10% of registered users are active each day.

•
Every daily active user uploads 1 photo per day.

•
Every daily active user views 50 feed pages per day.

•
The average original photo is 2 MB.

•
Each original photo also produces one 50 KB thumbnail.

•
A year contains 365 days.

•
The storage estimates use decimal units: 1 MB = 1,000,000 bytes and 1 TB = 1,000 GB.

•
The estimates describe average traffic; real traffic will vary by time zone, events, weekends, and viral content.

•
The estimates do not include extra copies for backups, database replication, or storage-provider metadata.

•
For peak feed traffic, a 5× multiplier is used, as requested.

2. Daily active users

10,000,000×10%=1,000,00010{,}000{,}000 \times 10\% = 1{,}000{,}000
10,000,000×10%=1,000,000





SnapShare has 1 million daily active users (DAU).

3. Traffic and storage estimates

Uploads per second

Daily uploads are:

1,000,000 DAU×1 upload per user per day=1,000,000 uploads/day1{,}000{,}000 \text{ DAU} \times 1 \text{ upload per user per day}
= 1{,}000{,}000 \text{ uploads/day}
1,000,000 DAU×1 upload per user per day=1,000,000 uploads/day





Using 86,400 seconds per day:

1,000,00086,400≈11.6 uploads/second\frac{1{,}000{,}000}{86{,}400} \approx 11.6 \text{ uploads/second}
86,400

1,000,000
​
≈11.6 uploads/second





The average upload rate is therefore about 11.6 uploads per second. If upload traffic has a similar 5× peak pattern, a planning peak would be approximately 58 uploads per second.

Feed views per second

Daily feed views are:

1,000,000 DAU×50 feed pages per user per day=50,000,000 feed pages/day1{,}000{,}000 \text{ DAU} \times 50 \text{ feed pages per user per day}
= 50{,}000{,}000 \text{ feed pages/day}
1,000,000 DAU×50 feed pages per user per day=50,000,000 feed pages/day





Average feed views per second are:

50,000,00086,400≈578.7 feed views/second\frac{50{,}000{,}000}{86{,}400} \approx 578.7 \text{ feed views/second}
86,400

50,000,000
​
≈578.7 feed views/second





Using the required 5× peak multiplier:

578.7×5≈2,893.5 feed views/second578.7 \times 5 \approx 2{,}893.5 \text{ feed views/second}
578.7×5≈2,893.5 feed views/second





Therefore:

•
Average feed views: approximately 579 per second

•
Peak feed views: approximately 2,894 per second

Photo storage per year

Each uploaded photo requires storage for:

•
Original: 2 MB

•
Thumbnail: 50 KB = 0.05 MB

•
Total per photo: 2.05 MB

Annual uploads are:

1,000,000×365=365,000,000 photos/year1{,}000{,}000 \times 365 = 365{,}000{,}000 \text{ photos/year}
1,000,000×365=365,000,000 photos/year





Annual original-photo storage is:

365,000,000×2 MB=730,000,000 MB365{,}000{,}000 \times 2 \text{ MB} = 730{,}000{,}000 \text{ MB}
365,000,000×2 MB=730,000,000 MB





This is approximately 730 TB per year for original photos.

Annual thumbnail storage is:

365,000,000×0.05 MB=18,250,000 MB365{,}000{,}000 \times 0.05 \text{ MB} = 18{,}250{,}000 \text{ MB}
365,000,000×0.05 MB=18,250,000 MB





This is approximately 18.25 TB per year for thumbnails.

Total photo and thumbnail storage is:

730 TB+18.25 TB=748.25 TB/year730 \text{ TB} + 18.25 \text{ TB} = 748.25 \text{ TB/year}
730 TB+18.25 TB=748.25 TB/year





SnapShare therefore needs approximately 748.25 TB of new object storage per year, before backups, replication, multiple image sizes, and provider overhead.

4. Read-heavy or write-heavy?

SnapShare is read-heavy.

There are approximately 11.6 photo uploads per second but approximately 579 feed views per second on average, which means feed reads are roughly 50 times more frequent than uploads. At the 5× peak, the system must handle almost 2,894 feed views per second.

This means the design should prioritize fast and scalable reads. Feed results should be cached, popular photo files should be served through a CDN, database reads should be distributed to a read replica, and app servers should remain stateless so more servers can be added during traffic peaks.

5. Why photos should not be stored inside the database

Photo files should not be stored as large binary values inside the database because they would make database storage much larger, increase backup and replication costs, consume database I/O, and make scaling photo delivery harder.

The original photos and thumbnails should go into durable object storage, such as Amazon S3, Google Cloud Storage, or an equivalent service. The database should store metadata such as the photo ID, owner ID, caption, timestamps, follow relationships, object-storage keys, thumbnail keys, and processing status. Object storage is designed for large files, high durability, and independent scaling, while the database remains focused on structured queries and metadata.

6. Architecture diagram

Plain Text


                         +------------------+
                         |  Mobile/Web      |
                         |  Clients         |
                         +--------+---------+
                                  |
                         +--------v---------+
                         | CDN              |
                         | Cached images    |
                         +---+----------+---+
                             |          |
             Photo delivery |          | API/feed requests
                             |          |
                   +---------v----------v---------+
                   |       Load Balancer          |
                   | Routes and spreads requests  |
                   +---------------+--------------+
                                   |
                   +---------------v---------------+
                   |          App Servers          |
                   | Stateless API and feed logic  |
                   +-----+-------------+-----------+
                         |             |
                         |             +------------------+
                         |                                |
                +--------v--------+              +--------v--------+
                | Cache           |              | Queue            |
                | Feed/data cache |              | Thumbnail jobs   |
                +--------+--------+              +--------+--------+
                         |                                |
                         |                                v
                         |                       +--------+--------+
                         |                       | Worker          |
                         |                       | Creates thumbs  |
                         |                       +--------+--------+
                         |                                |
                         |                                v
              +----------v-----------+          +---------+---------+
              | Primary Database    |          | Object Storage    |
              | Metadata and writes |          | Originals/thumbs  |
              +----------+-----------+          +---------+---------+
                         |                                ^
                         v                                |
              +----------+-----------+                    |
              | Read Replica        |--------------------+
              | Scaled read queries |
              +----------------------+



Components and the problems they solve

•
Clients: Mobile and web clients let users upload photos and request their personalized feeds.

•
CDN: The CDN serves frequently requested photo files from locations near users, reducing latency and origin bandwidth.

•
Load balancer: The load balancer spreads API traffic across app servers and removes unhealthy servers from service.

•
App servers: Stateless app servers handle authentication, upload coordination, feed generation, and photo metadata operations while allowing horizontal scaling.

•
Cache: The cache stores hot feed results and frequently used metadata so repeated reads do not overload the database.

•
Primary database: The primary database stores consistent structured data such as users, follows, photo metadata, and upload records.

•
Read replica: The read replica handles feed and metadata reads separately from writes, protecting the primary database from read traffic.

•
Object storage: Object storage keeps large original photos and thumbnails durably without turning the database into a file-serving system.

•
Queue: The queue absorbs thumbnail-processing work so an upload request does not wait for image processing to finish.

•
Worker: The worker consumes thumbnail jobs, creates thumbnails, uploads them to object storage, and updates processing status.

7. Photo-upload flow

1.
The user selects a photo in the mobile or web client.

2.
The client sends an upload request to the app through the load balancer, including the user identity and basic photo metadata.

3.
The app server authenticates the user and validates the file type, file size, and request permissions.

4.
The app server creates a photo record in the primary database with a status such as PROCESSING.

5.
The app server returns a secure upload URL, or uploads the file through a controlled server-side path, using an object-storage key that includes the photo ID.

6.
The client uploads the original 2 MB photo to object storage rather than sending the file through the database.

7.
After the original upload succeeds, the app publishes a thumbnail job to the queue containing the photo ID and object-storage key.

8.
The app can immediately show the user a processing state, allowing the upload API to remain fast.

9.
A worker reads the thumbnail job from the queue and downloads or streams the original photo from object storage.

10.
The worker resizes the original into a 50 KB thumbnail and uploads the thumbnail back to object storage under a separate key.

11.
The worker updates the photo metadata in the primary database with the thumbnail key and a completed status.

12.
Feed requests read the photo metadata and thumbnail location, while the CDN serves the thumbnail or original photo to users.

13.
The CDN caches the image response so later feed views do not repeatedly load the object-storage origin.

8. Trade-offs

Trade-off 1: Cache freshness versus performance

Caching feed results improves response time and reduces database load, but cached feeds can become briefly stale after a followed user publishes a photo. A short cache lifetime gives fresher feeds but increases database and app-server traffic; a longer lifetime improves performance but delays updates.

Trade-off 2: Asynchronous thumbnails versus immediate completeness

Using a queue and worker makes uploads fast and protects the API from image-processing spikes, but the thumbnail may not be available immediately. Synchronous thumbnail creation would give a complete result before responding, but it would increase upload latency and require more upload servers during bursts.

Trade-off 3: Read replicas versus read-after-write consistency

A read replica increases read capacity and protects the primary database, but replication can lag. A user may upload a photo and briefly fail to see it in a feed served from the replica; reading recently changed records from the primary improves consistency but adds load to the primary database.

Trade-off 4: Multiple image sizes versus storage cost

Generating several image sizes can improve mobile performance and reduce bandwidth, but it increases processing time and storage costs beyond  the estimated 748.25 TB per year. Generating only one thumbnail is cheaper, but it may be less efficient for different screen sizes.

