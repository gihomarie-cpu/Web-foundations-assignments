# SnapShare: Photo-App Scaling Plan

## 1. Purpose and assumptions

SnapShare is a photo-sharing application. Users upload original photos, view a feed, and open photo details. The design separates photo bytes from relational metadata and moves expensive image processing into background workers so an upload request does not need to wait for every thumbnail to finish.

These are planning estimates, not measurements from a production system:

- Daily active users (DAU): 1,000,000.
- Average upload volume: 1 photo per active user per day, or 1,000,000 uploads/day.
- Feed activity: 50 feed views per upload, giving 50,000,000 feed views/day. This represents a 50:1 feed-view-to-upload ratio.
- Average original photo size: 2 MB (decimal units).
- Average generated thumbnail size: 50 KB per upload.
- Peak traffic estimate: 5 times the daily average. Real traffic may be burstier, especially during a popular event, so production sizing must use measured traffic and load tests.
- Storage estimate excludes replication, backups, abandoned uploads, multiple thumbnail sizes, video, and storage overhead. These will increase actual capacity needs.

## 2. Workload and capacity estimates

### Upload requests

- Uploads per day: 1,000,000.
- Average upload rate: 1,000,000 / 86,400 seconds = **about 11.6 uploads/second**.
- Estimated peak upload rate at 5× average: **about 58 uploads/second**.

### Feed reads

- Feed views per day: 1,000,000 uploads × 50 = 50,000,000 feed views/day.
- Average feed-view rate: 50,000,000 / 86,400 = **about 579 views/second**.
- Estimated peak feed-view rate at 5× average: **about 2,894 views/second**.

### Annual image storage

- Original images: 1,000,000 × 2 MB = 2,000,000 MB/day, approximately 2 TB/day; 2 TB × 365 = **about 730 TB/year**.
- Thumbnails: 1,000,000 × 50 KB = 50,000,000 KB/day, approximately 50 GB/day; 50 GB × 365 = **about 18.25 TB/year**.
- Combined new image data: **about 748.25 TB/year**, before replication, backups, versions, and other overhead.

The feed-to-upload ratio is 50:1, so SnapShare is **read-heavy**. Read performance and cache efficiency are therefore major design priorities, while upload processing must absorb short bursts without blocking the user-facing API.

## 3. Proposed architecture

```text
                         Users / Mobile and Web Clients
                                      |
                                DNS / HTTPS
                                      |
                            CDN (cached thumbnails)
                                      |
                         Load Balancer / API Gateway
                                      |
                       +--------------+--------------+
                       |                             |
                  Application A                Application B
                       |                             |
                       +----------+------------------+
                                  |
                   +--------------+----------------+
                   |              |                |
              Cache (feed)   Primary Database   Object Storage
                                  |             (original images)
                           Read Replica                |
                                  |                    |
                                  +             Upload-complete event
                                                       |
                                                Durable Job Queue
                                                       |
                                                Thumbnail Workers
                                                       |
                                           Object Storage (thumbnails)
                                                       |
                                          Metadata/status update in DB
```

The client may upload the file directly to object storage using a short-lived, restricted pre-signed URL. The API still authorizes the user and controls which object key can be written. The diagram simplifies the event path: the application creates a durable job after confirming the original upload, and workers process it asynchronously.

## 4. Component definitions and responsibilities

1. **DNS and HTTPS:** DNS directs clients to the service endpoint; HTTPS encrypts traffic between clients and SnapShare. Certificates must be renewed and monitored.
2. **CDN:** Caches public or appropriately authorized thumbnail files near users, reducing repeated origin requests and image-loading latency. Private images require signed URLs or equivalent access controls; private content must not be cached as public content.
3. **Load balancer / API gateway:** Distributes API requests across healthy application instances and can enforce TLS policy, request limits, and basic rate limiting. It should not store session state locally on one server.
4. **Application servers:** Authenticate users, authorize actions, validate upload metadata, issue pre-signed upload URLs, create photo metadata, return feed results, and publish processing jobs. Multiple instances allow horizontal scaling.
5. **Cache:** Stores frequently requested feed pages, feed identifiers, or other safe-to-cache query results to reduce database reads. Cached data is temporary and can be rebuilt from the database. Updates and invalidation rules must limit stale feed results.
6. **Primary relational database:** Stores structured metadata such as user ID, photo ID, object key, caption, timestamps, processing status, visibility, and relationships. It does not store the full image bytes. The primary handles authoritative writes and transactions.
7. **Read replica:** Serves suitable read queries to reduce pressure on the primary database. Replication is usually asynchronous, so a recent write may not be immediately visible on the replica; read-after-write requests may need to use the primary.
8. **Object storage:** Stores original image files and generated thumbnails as objects. It is designed for large binary files and can scale independently from the relational database. Object keys should be unguessable or access-controlled, and lifecycle rules can move or delete older objects according to policy.
9. **Durable job queue:** Holds thumbnail-processing jobs until workers can process them. It buffers traffic spikes and separates the user's upload request from slower image manipulation. Jobs should be retryable and safe to process more than once.
10. **Thumbnail workers:** Consume queued jobs, verify and decode images, apply size/format limits, create thumbnail variants, and write those files to object storage. Worker concurrency can be scaled independently according to queue depth and processing time.
11. **Monitoring and alerting:** Tracks API latency and errors, upload failures, queue depth and age, worker failures, storage growth, database replication lag, and cache hit rate. Alerts help operators detect backlogs and partial outages before they become prolonged incidents.

## 5. Step-by-step photo upload flow

1. **User selects a photo.** The client checks basic file details such as file size and allowed file type for a quick user experience. Client checks are not trusted as a security boundary.
2. **Client requests upload authorization.** It sends an authenticated request to the API with metadata such as file type, size, caption, and visibility. The server checks authentication, authorization, quotas, and allowed limits.
3. **Server creates an upload intent.** The application generates a unique photo ID and object key, records an upload intent or pending metadata row, and returns a short-lived pre-signed URL plus the photo ID. The URL should permit only the intended operation and object key.
4. **Client uploads bytes to object storage.** The client sends the image directly to object storage using the pre-signed URL. The API server does not proxy the full file, which saves application bandwidth and memory. If the upload fails, the client can retry while the URL remains valid or request a new one.
5. **Client confirms completion.** The client calls a completion endpoint with the photo ID. The server verifies that the expected object exists and checks trusted storage metadata (and, where appropriate, a checksum); it does not blindly trust a client claim that the upload succeeded.
6. **Server marks the photo as processing and enqueues a job.** The metadata is updated transactionally where possible, and a durable thumbnail job is published. To avoid losing work if a database update succeeds but queue publishing fails, use a transactional outbox or another reliable publish-and-retry pattern.
7. **Worker processes the image asynchronously.** A worker receives the job, validates and decodes the file, applies limits to image dimensions and decompression, removes or handles metadata according to privacy policy, and creates thumbnail variants. The worker uses idempotent processing so a duplicate job does not create inconsistent records.
8. **Worker stores thumbnails and updates status.** Generated files are written to object storage. The worker then marks the photo `ready` in the database. If processing fails, it retries transient errors and eventually records a failed status for monitoring or safe reprocessing.
9. **Feed exposes the completed photo.** The feed query returns photos with `ready` status and the correct visibility permissions. The client loads thumbnail URLs through the CDN. A cache invalidation or short cache lifetime helps the new photo appear promptly; if processing is still running, the UI can show “processing” and refresh later.
10. **Operations monitor the pipeline.** Alerts watch upload completion failures, queue age, worker retry/dead-letter counts, thumbnail latency, object-storage errors, and database lag. Failed jobs can be inspected and replayed without requiring the user to upload the original again.

### Why asynchronous processing matters

Image decoding, resizing, and encoding consume CPU and memory and can take much longer than a metadata API request. The API should acknowledge a successful original upload once it is safely stored and the processing job is durably recorded—not wait for every thumbnail to be generated. The queue absorbs bursts, and workers scale separately. This improves perceived latency and prevents heavy image manipulation from exhausting the API servers. The trade-off is that the photo may temporarily remain in a `processing` state instead of appearing immediately in the feed.

## 6. System trade-offs

### A. Asynchronous processing vs immediate consistency

**Choice:** Use a queue and background workers for thumbnail generation. The upload API responds before thumbnails are ready, and the photo status moves from `processing` to `ready` later.

**Benefit:** Lower API response latency, independent worker scaling, and better resilience during upload bursts.

**Cost:** Eventual consistency: a newly uploaded photo may not appear immediately. The client needs a processing state and retry/polling behavior, and operators need queue monitoring and replay procedures.

### B. Cache and read replicas vs freshest feed data

**Choice:** Cache popular feed data and serve suitable reads from a read replica, while sending writes to the primary database.

**Benefit:** Reduces primary database load and improves feed latency for the read-heavy workload.

**Cost:** Cached feeds can be stale, and asynchronous replication can delay visibility of recent writes. Use short TTLs or targeted invalidation, and route read-after-write or consistency-sensitive operations to the primary when necessary. Never use stale cache state as the authority for permissions or ownership.

### C. Direct-to-object-storage uploads vs simpler API handling

**Choice:** The server authorizes the upload, but the client transfers image bytes directly to object storage using a restricted pre-signed URL.

**Benefit:** Keeps large file transfers away from application servers, reducing server bandwidth, memory pressure, and scaling cost.

**Cost:** The flow is more complex: URLs expire, clients may abandon uploads, and the service must verify completion and clean up orphaned objects. Add upload limits, lifecycle cleanup, and a secure completion endpoint.

### D. Replication and redundancy vs cost and consistency

**Choice:** Run multiple application instances, use a database read replica, and store images in durable object storage.

**Benefit:** Better availability and the ability to scale reads and application capacity independently.

**Cost:** Additional infrastructure and operational complexity. A read replica may lag; replication is not a substitute for backups. Monitor replica lag, test restore procedures, and ensure the primary database, queue, object storage, and deployment region have appropriate recovery plans.

### E. Thumbnail sizes and retention vs image quality and storage cost

**Choice:** Keep originals in object storage and generate a small number of standardized thumbnail sizes rather than serving originals for every feed card.

**Benefit:** Smaller downloads, faster feeds, and lower bandwidth usage.

**Cost:** Additional stored variants and processing work; small thumbnails may not suit every screen, and deleting old content requires coordinated cleanup of metadata and objects. Choose sizes based on product needs and measure actual storage and CDN costs.

## 7. Reliability, security, and operational safeguards

- Enforce authentication, authorization, upload quotas, file-size limits, and visibility checks on the server.
- Treat MIME type and filename supplied by the client as untrusted; validate file signatures and decode images in a constrained worker environment.
- Use short-lived pre-signed URLs, private object buckets by default, and signed CDN URLs for protected content.
- Make upload completion and worker processing idempotent; use unique photo IDs and job identifiers to handle retries safely.
- Use queue retries with backoff and a dead-letter queue for repeatedly failing jobs.
- Track orphaned uploads and remove abandoned temporary objects through lifecycle policies or scheduled cleanup.
- Back up metadata, test restoration, monitor database replication lag, and document recovery objectives.
- Load-test feed reads, upload bursts, worker throughput, and failure scenarios before choosing final instance sizes or service limits.

## 8. Conclusion

SnapShare is read-heavy, so the design prioritizes CDN delivery, feed caching, and scalable read capacity. Original photos and thumbnails live in object storage while the database stores searchable metadata. The upload path uses direct object upload followed by a durable asynchronous thumbnail job, keeping expensive image processing away from the user-facing request. This design deliberately accepts short periods of eventual consistency in exchange for lower latency and better burst handling, with status tracking, retries, monitoring, and recovery procedures to make that behavior operationally manageable.
