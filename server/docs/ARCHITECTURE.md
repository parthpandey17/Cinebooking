# CineBooker — Architecture

## Layers
```
HTTP → routes → controllers → services → repositories → db(pool)
                                   │
                     sockets / email / scheduler (side effects)
```
- **routes** — wire URLs to controllers, attach `protect` / `authorize`. Wildcard
  params (`/:showtimeId`) are always mounted **after** literal paths (`/my`, `/admin/*`).
- **controllers** — thin; wrapped in `asyncHandler`; translate service results to the
  canonical `{ success, data|message, ... }` envelope. No SQL, no business rules.
- **services** — business logic, validation, `AppError`, `_id` aliasing, and all
  concurrency orchestration (transactions, FOR UPDATE, idempotency).
- **repositories** — raw parameterised SQL **only**. Each method takes an optional
  `conn` so it runs on the pool or joins a caller's transaction.
- **db** — `pool.js` (mysql2 pool, `execute`-based prepared statements, `healthCheck`,
  `close`) and `withTransaction(fn)` which passes a `runner(conn)` so repositories
  transparently participate in the transaction.

## Transactions
`withTransaction(async (conn) => { ... })` opens a connection, `BEGIN`s, runs the
callback, `COMMIT`s (or `ROLLBACK`s on throw), and releases. Repository methods call
`runner(conn)` — if `conn` is present they use it, otherwise they use the pool. This
is how a single booking finalize atomically: locks the showtime row, checks/inserts
each booked seat, and flips the payment to `paid` — then performs idempotent
post-commit side effects (ticket creation, lock cleanup, waitlist completion, email).

## Concurrency primitives
| Concern | Primitive |
|---|---|
| Double-booking | `SELECT ... FOR UPDATE` (showtime row) + `UNIQUE(showtime_id,row,number)` |
| One hold per seat | `UNIQUE(showtime_id, seat_label)` on `seat_locks` |
| FIFO offer | `ORDER BY joined_at LIMIT 1 FOR UPDATE` on `waitlists` |
| Idempotent payment | UNIQUE `tickets.payment_id`; re-runnable finalize |
| Idempotent email | sparse UNIQUE `email_logs.idempotency_key` |

## Real-time (Socket.IO)
`socketService` exposes `emitToUser(userId, event, payload)` and
`emitToShowtime(showtimeId, ...)`. Clients join `user:<id>` and `showtime:<id>` rooms.
Events preserved from the Mongo app: `waitlistOfferCreated`, `waitlist:offer`,
`waitlist:expired`, `waitlist:confirmed`, `waitlist:requeued`,
`waitlist:partial-accepted`, `seatmap:update`.

## Background jobs (node-cron)
- Every **1 min**: sweep expired seat locks → re-process affected waitlists; expire
  stale offers (release holds, re-queue partially-fulfilled entries, or mark EXPIRED).
- Every **15 min**: send showtime reminders (idempotent via `email_logs`).
Both are overlap-guarded and skip when the DB health check fails.

## Startup / shutdown
`server.js` runs a DB health check before `listen()` (exits 1 on failure), initialises
Socket.IO, starts schedulers, and installs `SIGTERM`/`SIGINT` handlers that close the
HTTP server and the MySQL pool gracefully.

## Payment flow
`create-order` (Razorpay order + validation + missing-lock 400) →
`verify` (HMAC `order|payment`) → `webhook` (HMAC over raw body; `payment.captured` /
`order.paid` / `invoice.paid` finalize; `payment.failed` / `invoice.expired` fail +
release; `refund.*` → cancel service). Verify and webhook both call the same
idempotent `finalizeBooking`, so a dropped browser never loses a paid booking.
