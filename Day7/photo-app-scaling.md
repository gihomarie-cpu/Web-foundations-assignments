# SnapShare Photo-App Scaling Plan

## 1. Assumptions and traffic estimates

### Given facts

- Registered users: 10,000,000
- Daily active users (DAU): 10% of registered users
- Each daily active user uploads 1 photo per day
- Each daily active user views 50 feed pages per day
- Average original photo size: 2 MB
- Each photo also has a 50 KB thumbnail
- Peak feed traffic is estimated at 5 times the average rate

### Assumptions

1. A day has 86,400 seconds and a year has 365 days.
2. The 10% daily-active rate applies to registered users, giving a steady average of 1 million DAU.
3. Each DAU uploads exactly one photo and views 50 feed pages per day.
4. Each upload creates one original image and one thumbnail. For storage calculations, decimal units are used: 1 MB = 1,000 KB and 1 TB = 1,000 GB.
5. The yearly storage estimate assumes all uploaded originals and thumbnails are retained for one year. It excludes replicas, backups, temporary files, database metadata, and storage overhead.
6. Uploads are spread evenly across the day for the average rate. Actual traffic varies; the specified 5× peak factor is applied to feed views.
7. A feed-page view means one request to load a page of feed content. It is not the same as an individual image request, because one page can contain multiple photos.
8. A relational database stores user, follow, and photo metadata, while image bytes are stored in object storage.

### Daily active users

DAU = 10,000,000 × 10% = **1,000,000 daily active users**.

### Uploads per second

Daily uploads = 1,000,000 active users × 1 photo = **1,000,000 uploads/day**.

Average upload rate = 1,000,000 ÷ 86,400 = **11.57 uploads/second**, approximately **11.6 uploads/second**.

This is an average; actual upload traffic may be higher during busy periods.

### Feed views per second

Daily feed views = 1,000,000 active users × 50 pages = **50,000,000 feed page views/day**.

Average feed-view rate = 50,000,000 ÷ 86,400 = **578.70 feed page views/second**, approximately **579/second**.

Peak feed-view rate = 578.70 × 5 = **2,893.52 feed page views/second**, approximately **2,894/second**.

These rates count feed-page requests only; image delivery adds further requests or bytes, depending on how the client and CDN load images.

### Photo storage per year

Original-photo storage per day = 1,000,000 × 2 MB = **2,000,000 MB/day = 2,000 GB/day = 2 TB/day**.

Thumbnail storage per day = 1,000,000 × 50 KB = 50,000,000 KB/day = 50,000 MB/day = **50 GB/day**.

Total storage per day = 2,000 GB + 50 GB = **2,050 GB/day = 2.05 TB/day**.

Yearly originals = 2 TB/day × 365 = **730 TB/year**.

Yearly thumbnails = 50 GB/day × 365 = **18,250 GB/year = 18.25 TB/year**.

Total new photo storage per year = 730 TB + 18.25 TB = **748.25 TB/year**, approximately **0.75 PB/year** in decimal units.

This is the logical size of one copy of all retained original files and thumbnails. Replication, backups, and storage-system overhead increase the physical capacity and cost required.

## 2. Read-heavy or write-heavy?

SnapShare is **read-heavy** by request count: users generate 50 feed-page views for every 1 photo upload, a **50:1 feed-view-to-upload ratio**. The design should therefore scale feed reads efficiently with a CDN, caching, read replicas, and horizontally scalable application servers. Uploads still need durable storage and reliable processing, so the write path must be safe and resilient even though reads are more frequent.

## 3. Why image files belong in object storage

The database should store structured metadata—such as photo ID, owner, caption, timestamps, object-storage keys, thumbnail key, and processing status—not the full image bytes. Storing large image blobs in the main relational database would make database backups, replication, queries, and storage management more expensive and can increase I/O pressure. Original photos and thumbnails should instead be stored in **object storage**, which is designed for durable, large-scale file storage; the database keeps the keys and metadata needed to find those objects. A CDN can cache and deliver frequently viewed images near users.

## 4. Architecture diagram

```text
                          +----------------------+
                          |        Users         |
                          +----------+-----------+
                                     |
                         +-----------v-----------+
                         |   CDN (static/media)  |
                         +-----------+-----------+
                                     |
                         +-----------v-----------+
                         |    Load Balancer      |
                         +-----------+-----------+
                                     |
                   +-----------------+-----------------+
                   |                                   |
          +--------v---------+                +--------v---------+
          |   App Server A   |                |   App Server B   |
          | API / auth /     |                | API / auth /     |
          | business logic   |                | business logic   |
          +---+-----------+--+                +--+------------+--+
              |           |                      |            |
              |           +----------+-----------+            |
              |                      |                        |
      +-------v--------+     +-------v---------+              |
      | Cache          |     | Primary Database|              |
      | feed / metadata|     | users, follows, |              |
      +----------------+     | photo metadata  |              |
                             +-------+---------+              |
                                     |                        |
                              replication                     |
                                     |                        |
                             +-------v---------+              |
                             | Read Replica    |<-------------+
                             | feed/metadata   |
                             +-----------------+

 Photo upload bytes:
 App Server ---> Object Storage (original photos and thumbnails)
                         |
                         | upload-complete event / job message
                         v
                  +----------------+
                  | Durable Queue  |
                  +-------+--------+
                          |
                          v
                  +----------------+
                  | Thumbnail      |
                  | Worker(s)      |
                  +-------+--------+
                          |
                 reads original object,
                 creates thumbnail,
                 writes thumbnail object
                          |
                          v
                  Object Storage ---> CDN ---> Feed viewers
```

The diagram is logical: production networking may place object storage behind signed upload URLs, and workers may update the primary database after thumbnail generation.

## 5. Components and the problems they solve

- **CDN:** Caches and serves popular thumbnails and other media close to users, reducing latency and origin-server bandwidth.
- **Load balancer:** Distributes incoming API requests across healthy application servers and routes traffic away from unhealthy instances.
- **App servers:** Authenticate users, enforce permissions, validate requests, coordinate uploads, and implement feed and photo business logic.
- **Cache:** Keeps frequently requested feed results and metadata in fast memory to reduce repeated database reads, with expiration or invalidation to limit stale results.
- **Primary database:** Stores authoritative user, follow, and photo metadata and handles durable metadata writes.
- **Read replica:** Serves eligible read queries to reduce load on the primary database, while accepting that replication lag can make some reads briefly stale.
- **Object storage:** Stores the large original and thumbnail image files durably without bloating the relational database.
- **Durable queue:** Buffers thumbnail-generation jobs so upload requests do not have to wait for image processing and jobs can be retried after temporary failures.
- **Thumbnail worker(s):** Consume queued jobs, validate and resize original images, write thumbnails to object storage, and update processing status in the database.

## 6. Step-by-step photo upload flow

1. **User starts an upload:** The client authenticates and asks the app API to begin uploading a photo; the server checks the user's permissions, file type, and size limits.
2. **Create upload metadata:** The app creates a photo record in the primary database with a unique photo ID and a status such as `PENDING_UPLOAD`.
3. **Upload the original:** The server provides a short-lived signed upload URL, or proxies the upload if direct uploads are not supported; the client sends the image bytes to object storage rather than storing them in the database.
4. **Confirm upload:** After object storage confirms success, the client or storage event notifies the app. The app verifies the object exists and updates the photo record to `PROCESSING`.
5. **Enqueue thumbnail work:** The app publishes a job containing the photo ID and object key to the durable queue. The API can respond that the upload was accepted while thumbnail processing continues asynchronously.
6. **Worker processes the job:** A worker consumes the message, fetches the original object, checks that it is a valid image, resizes it, and creates the 50 KB thumbnail target (or a suitable compressed thumbnail within configured limits).
7. **Store the thumbnail:** The worker writes the thumbnail to object storage under a separate key and updates the database with the thumbnail key and status `READY`.
8. **Display the photo:** The feed API returns photo metadata and image URLs/keys. The CDN serves the thumbnail to viewers; the original can be served when needed under appropriate access controls.
9. **Handle failures safely:** Queue messages are retried for transient errors; jobs are idempotent so duplicate delivery does not create duplicate photo records or corrupt status. Repeated failures go to a dead-letter queue for investigation, and monitoring alerts the team.
10. **Keep the feed consistent:** Until the thumbnail is ready, the UI can show a processing placeholder or omit the photo from the normal feed. The system should not expose a broken thumbnail URL as if processing had completed.

## 7. Trade-offs

### Trade-off 1: Asynchronous processing vs. immediate availability

**Choice:** Return success for the original upload once it is durably stored and the job is safely queued, then generate the thumbnail asynchronously.

**Benefit:** The user does not have to wait for image resizing; slow processing spikes are absorbed by the queue, and API servers remain available for other requests.

**Cost:** The photo may not appear in its final feed form immediately, and the system needs queue monitoring, retries, idempotency, and a processing state in the UI.

### Trade-off 2: Cache and read replicas vs. fresh consistency

**Choice:** Use cache and a read replica for high-volume feed reads, while writing metadata to the primary database.

**Benefit:** Read traffic scales more cheaply and with lower latency, protecting the primary database from the 50:1 feed-to-upload workload.

**Cost:** Cached feed data or replica reads can be briefly stale after a new upload, follow change, or deletion. For actions that require fresh state, read from the primary or invalidate/update cache entries carefully.

### Trade-off 3: Object storage and CDN vs. simpler single-store design

**Choice:** Store media in object storage and deliver popular files through a CDN, while keeping metadata in the relational database.

**Benefit:** Object storage scales for large files, and CDN caching reduces bandwidth and response time.

**Cost:** The architecture has more moving parts, access-control rules, signed URLs, cache invalidation, and lifecycle policies to manage; the team must coordinate metadata status with media availability.

### Trade-off 4: Durable multi-copy storage vs. storage cost

**Choice:** Use the storage provider's durability features and a defined backup/replication policy rather than keeping only one unprotected copy.

**Benefit:** The service can recover from hardware or operational failures more reliably.

**Cost:** Replicas, backups, and retained originals increase physical storage cost beyond the estimated 748.25 TB of new logical media per year. Retention rules, compression, and lifecycle tiers can control cost, but deleting old media reduces historical availability.

## Operational notes

- Monitor upload success/failure rate, queue depth and oldest-job age, thumbnail processing latency, CDN hit rate, API latency, database CPU/replication lag, and object-storage errors.
- Apply authentication and authorization to private photos; use signed URLs or equivalent access controls instead of exposing unrestricted object keys.
- Set file-size/type limits, validate image content, and protect workers from malformed or malicious files.
- Define retention, backup, recovery, and deletion policies so deleting a photo also removes or expires its original, thumbnail, metadata, and cached copies as appropriate.
