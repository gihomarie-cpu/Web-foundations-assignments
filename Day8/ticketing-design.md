# TicketHub: Ticketing System Design

## 1. Requirements

### Functional requirements
- Visitors can browse events, view details and prices, and inspect seat availability.
- Users can register/sign in, temporarily hold available seats, pay for a valid hold, and view confirmed tickets.
- The system expires unpaid holds and releases those seats for sale.
- Administrators can create events, configure seats/prices, and monitor sales.

### Non-functional requirements
- **Correctness:** a seat must never be sold to two customers; orders and payment status must remain consistent.
- **Speed:** event pages and seat maps should respond quickly during normal traffic and remain usable during high-demand sales.
- **Fairness:** a waiting room and rate limits should control bursts transparently; repeated refreshes must not let users bypass the queue.
- **Security:** authenticate purchase actions, authorize access to orders, validate input server-side, verify payment webhooks, and never store raw card details.
- **Scalability and availability:** add app servers horizontally, cache public event data, and use health checks, backups, and tested failover.
- **Observability and accessibility:** monitor latency, errors, queue depth, and payment failures; make seat states and status messages accessible without relying only on colour.

## 2. Traffic estimates

Assumptions: 86,400 seconds/day; daily traffic is averaged across the day; actual traffic is bursty. Page views are not identical to API requests because one page can trigger multiple requests.

### Normal day
- Registered users: 2,000,000.
- Daily visitors: 50,000.
- Pages per visitor: 10.
- Tickets sold: 5,000.

Page views/day = 50,000 × 10 = **500,000**.
Average page views/second = 500,000 ÷ 86,400 ≈ **5.8**.
Ticket sales/second = 5,000 ÷ 86,400 ≈ **0.058** (about one sale every 17 seconds on average).

### Popular concert sale
200,000 people try to buy 20,000 seats in 10 minutes (600 seconds).

Average arrival rate = 200,000 ÷ 600 ≈ **333 people/second**.
Demand ratio = 200,000 ÷ 20,000 = **10 people per seat** on average.
If each person makes just one browse/seat request and one hold attempt, that is approximately **666 requests/second**, before retries, refreshes, payment calls, and other API activity. This is an illustrative estimate; load testing is needed to establish real capacity.

The buyer arrival rate is roughly 57 times the normal average page-view rate (333 ÷ 5.8), though these metrics are not perfectly equivalent. Use a waiting room, rate limiting, caching for public data, and a controlled release rate to protect the purchase path.

## 3. API design

Base path: `/api/v1`. Use JSON and HTTPS. Authenticated endpoints require a valid session or bearer token.

| Method and path | Description | Success status |
|---|---|---|
| `GET /events` | Browse/search events with pagination and date filters. | `200 OK` |
| `GET /events/{eventId}` | Get event, venue, sale time, and pricing details. | `200 OK` |
| `GET /events/{eventId}/seats` | Get seat labels, prices, and display availability. | `200 OK` |
| `POST /events/{eventId}/holds` | Atomically hold available seat(s) temporarily. | `201 Created` |
| `DELETE /holds/{holdId}` | Release the user's active hold. | `204 No Content` |
| `POST /orders` | Create an order from a valid hold and start payment. | `201 Created` |
| `POST /payments/webhook` | Receive and verify payment-provider notifications. | `200 OK` |
| `GET /me/tickets` | List the authenticated user's confirmed tickets. | `200 OK` |

Example request to hold a seat:

`POST /api/v1/events/event_42/holds`

```json
{
  "seatIds": ["A-10"],
  "idempotencyKey": "hold-request-abc123"
}
```

Example response (`201 Created`):

```json
{
  "holdId": "hold_901",
  "eventId": "event_42",
  "seatIds": ["A-10"],
  "status": "active",
  "expiresAt": "2026-10-16T15:05:00Z"
}
```

If a seat has already been held or sold, return `409 Conflict`.

Example order request:

`POST /api/v1/orders`

```json
{
  "holdId": "hold_901",
  "idempotencyKey": "order-request-xyz456"
}
```

Example response (`201 Created`):

```json
{
  "orderId": "order_3001",
  "status": "pending_payment",
  "amount": 25000,
  "currency": "RWF",
  "paymentUrl": "https://payments.example/checkout/session_123"
}
```

The server calculates the amount from trusted seat/event records, not from a browser-supplied price. A signed payment webhook is verified and handled idempotently before the order is marked paid and the seat sold.

Common errors: `400 Bad Request` (invalid input), `401 Unauthorized` (missing/invalid login), `403 Forbidden` (permission denied), `404 Not Found` (unknown resource), `409 Conflict` (seat unavailable or hold expired), `429 Too Many Requests` (rate limit), and `500 Internal Server Error` (unexpected failure).

Example `409` body:

```json
{
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "Seat A-10 is no longer available. Please choose another seat."
  }
}
```

## 4. Data model

Required core tables are `users`, `events`, `seats`, and `orders`. A practical implementation also needs `order_items` to map multiple seats to an order and `seat_holds` to track temporary holds.

- **Users → Orders: one-to-many.** One user can place many orders; each order belongs to one user.
- **Events → Seats: one-to-many.** One event has many seats; each seat belongs to one event.
- **Orders and Seats:** `order_items` associates the seat(s) in an order and stores the price at purchase time. A seat should have at most one final sold order item.
- **Seat holds:** a temporary record connects one user to one seat until expiry.

### SQLite schema example

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    venue TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    sale_opens_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('draft','on_sale','sold_out','cancelled'))
);

CREATE TABLE seats (
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL,
    seat_label TEXT NOT NULL,
    price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
    status TEXT NOT NULL DEFAULT 'available'
      CHECK (status IN ('available','held','sold')),
    FOREIGN KEY (event_id) REFERENCES events(id),
    UNIQUE (event_id, seat_label)
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending_payment','paid','failed','cancelled','expired')),
    total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL,
    seat_id INTEGER NOT NULL UNIQUE,
    unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (seat_id) REFERENCES seats(id)
);

CREATE TABLE seat_holds (
    id INTEGER PRIMARY KEY,
    seat_id INTEGER NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active','converted','released','expired')),
    FOREIGN KEY (seat_id) REFERENCES seats(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_events_status_sale_time ON events(status, sale_opens_at);
CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_holds_status_expiry ON seat_holds(status, expires_at);
```

`price_minor` stores money as an integer in the smallest agreed currency unit, avoiding floating-point rounding. Define the unit and currency consistently in the application.

## 5. Preventing double-booking

A seat map shown in a browser is only a snapshot; two users can see the same seat as available at once. The server and database must arbitrate the race.

1. Start a database transaction when a user requests a hold.
2. Atomically change the seat from `available` to `held` only if it is still available, or lock the seat row using the production database's row-locking mechanism.
3. Check the affected-row count. If no row changed, another request won; return `409 Conflict`.
4. Store the owner and expiry in the same transaction and commit. `UNIQUE(event_id, seat_label)` prevents duplicate seat records; unique `seat_id` constraints on holds and order items prevent competing records from claiming the same seat.
5. On payment, verify the signed provider webhook and use another transaction to confirm the hold is active and unexpired, mark the seat sold, mark the order paid, and convert the hold. Use idempotency keys so retries and duplicate webhooks do not create duplicate sales.
6. Expiry workers release expired holds, but the hold/purchase API must also check the timestamp itself so correctness does not depend only on the worker running on time.

A production PostgreSQL implementation can use `SELECT ... FOR UPDATE` or an atomic conditional update such as `UPDATE seats SET status='held' WHERE id=? AND status='available'`. The transaction and constraints—not the cache or browser—must make the final decision. SQLite is useful for demonstrating constraints, but the production database must be load-tested for the required concurrency. Payment must not silently convert an expired hold if another customer has acquired the seat.

## 6. Architecture diagram

```text
 Customers / Browsers / Mobile Apps
                 |
                 v
              +-----+
              | DNS |
              +-----+
                 |
                 v
              +-----+       static assets / cacheable event pages
              | CDN | ------------------------------------------>
              +-----+
                 |
                 v
        +------------------+
        | Waiting room /   |
        | rate limiter     |
        +------------------+
                 |
                 v
          +--------------+
          | Load balancer|
          +--------------+
             |        |
             v        v
          +------+ +------+
          | App A| | App B|  ... horizontally scaled
          +------+ +------+
             |        |
             +---+----+
                 |
        +--------+---------+
        |        |         |
        v        v         v
     +------+ +--------+ +-------------+
     | Cache| |Primary | | Durable     |
     |      | | DB     | | queue       |
     +------+ +--------+ +-------------+
                  |             |
             replication        v
                  v          +--------+
             +---------+     | Worker |
             | Read    |     | expiry,|
             | replica |     | email  |
             +---------+     +--------+

 App servers <----> Payment provider (signed webhooks)
```

### Component responsibilities

- **Client:** lets customers browse events, choose seats, place holds, pay, and view tickets.
- **DNS:** resolves TicketHub's domain to its network entry point.
- **CDN:** serves static files and cacheable public event content near users, reducing origin traffic.
- **Waiting room/rate limiter:** smooths the sudden sale burst, controls entry rate, and limits abusive retries.
- **Load balancer:** sends requests to healthy app servers and removes unhealthy instances from rotation.
- **App servers:** authenticate users, validate requests, calculate trusted prices, and coordinate business logic.
- **Cache:** accelerates public event reads; it is not authoritative for seat availability or purchase decisions.
- **Primary database:** stores seat state, holds, orders, and payment outcomes with transactions and constraints.
- **Read replica:** serves suitable browse queries and reduces primary read load; critical purchase decisions use the primary.
- **Durable queue:** buffers asynchronous jobs such as notifications and hold-expiry processing.
- **Worker:** processes jobs, retries recoverable failures, and releases expired holds.
- **Payment provider:** securely handles payment details and sends signed payment outcome notifications.

## 7. Trade-offs and avoiding single points of failure

### Fairness versus throughput
A waiting room controls demand and provides a more orderly sale, but it adds waiting time and limits how quickly customers enter checkout. Use a transparent queue policy, communicate wait estimates, and prevent refreshes from resetting or bypassing queue position.

### Read performance versus consistency
Caches and read replicas improve event browsing performance but may show stale seat availability. Cache public event details, but validate holds and purchases against the primary database inside transactions.

### Hold duration versus seat utilization
Long holds give users more time to pay but keep seats unavailable; short holds increase turnover but can frustrate customers. Choose a clear hold duration, show a countdown, and release expired holds reliably.

### Redundancy versus cost
Multiple app servers, replicated infrastructure, and durable queues improve resilience but cost more and require operational work. Run app instances across separate failure zones, health-check them, use redundant DNS/network entry points, keep backups, and test database failover. A read replica alone is not a backup. Make queues durable and workers restartable; monitor queue age, payment errors, and recovery outcomes.

## Conclusion

TicketHub should scale browsing with a CDN, cache, and read replica, while the primary database remains authoritative for seat holds and sales. A waiting room protects the purchase path during the popular concert sale, and atomic transactions plus database constraints prevent double-booking.
