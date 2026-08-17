# CineBooker: MongoDB → MySQL migration

This is a staged migration. Each stage is something you can run and verify before
the next one lands, because the risky parts (concurrent booking, waitlist, payment
idempotency) only reveal bugs against a live MySQL instance.

## Stack decisions
- `mysql2/promise` with a connection pool. No ORM — raw parameterised SQL.
- Layering: **controllers → services → repositories(SQL) → db**. No SQL in controllers.
- Transactions via a `withTransaction(fn)` helper (BEGIN / COMMIT / ROLLBACK).
- Concurrency via `SELECT ... FOR UPDATE` + DB-level UNIQUE constraints.
- Seat-lock expiry via `locked_until` + a `node-cron` cleanup job (replaces Mongo TTL).

## Collection → table mapping
| Mongo model | MySQL table(s) |
|---|---|
| User | `users` (embedded `tickets[]` dropped — `tickets` table is source of truth) |
| Movie | `movies` |
| Cinema | `cinemas` |
| Theater | `theaters` (this app's "screen"); `seatPlan` inlined |
| Showtime | `showtimes` + `showtime_booked_seats` (was `seats[]`) |
| SeatLock | `seat_locks` (`locked_until` replaces TTL) |
| Payment | `payments` + `payment_seats`; refund block inlined |
| Ticket | `tickets` + `ticket_seats` |
| Waitlist | `waitlists` + `waitlist_offered_seats` + `waitlist_partial_bookings` |
| EmailLog | `email_logs` |

### Honest deviations from the migration brief
Your brief lists tables this codebase doesn't actually use. I did **not** create them,
because unused tables are pure risk:
- **Screens / Seats** — a *theater* is the screen; seats are virtual (derived from
  `seat_plan_row`/`seat_plan_column`). Booked seats are `showtime_booked_seats`.
- **RefreshTokens / Google OAuth** — auth here is username + password + a 30-day JWT.
  There is no refresh-token flow or OAuth in the code.
- **Notifications** — realtime is Socket.IO; durable record is `email_logs`.
- **Admins** — admin is just `users.role = 'admin'` (RBAC via the `protect`/`authorize`
  middleware), so no separate table.

If you genuinely need any of these (e.g. a course rubric requires refresh tokens),
say so and I'll add them as real, wired features — not empty tables.

## IDs and the frontend contract
Mongo `_id` (24-hex) → `BIGINT AUTO_INCREMENT`. The frontend treats IDs as opaque
strings in URLs and comparisons, so the repository layer will return each row's PK as
`_id` (string). Response JSON shapes stay identical — no frontend changes.

## Concurrency model (the important part)
- **Double booking** is impossible at the DB level: `UNIQUE(showtime_id, seat_row,
  seat_number)` on `showtime_booked_seats`. A losing concurrent insert throws
  `ER_DUP_ENTRY`, which the service treats as "seat taken" and rolls back.
- **Booking / payment finalize**: inside one transaction — lock the relevant rows
  with `SELECT ... FOR UPDATE`, verify none are booked, insert booked seats, write
  payment + ticket, delete the user's seat locks. Any failure → `ROLLBACK`.
- **Seat locks**: `UNIQUE(showtime_id, seat_label)` gives the same "one holder per
  seat" guarantee the Mongo compound index gave. Expiry is a `node-cron` job deleting
  `WHERE locked_until < NOW()`, then running waitlist processing for affected showtimes.
- **Waitlist FIFO**: `ORDER BY joined_at` with `SELECT ... FOR UPDATE` when claiming the
  next entry, so two cron ticks can't double-offer. Partial offers, book-and-stay,
  book-and-leave, decline, and re-queue (preserving `joined_at`) all port over.

## Stages
1. **`db/schema.sql`** ← you are here. Review + run it.
2. `db/pool.js` (mysql2 pool) + `db/withTransaction.js` + `.env` keys. Boot check.
3. Repositories + services + `seed.sql` / `seed.js`, feature by feature, riskiest first:
   auth → movies/cinemas/theaters/showtimes → **booking + payment** → seat locks →
   **waitlist** → tickets/cancel/refund → admin → email.
4. Wire Socket.IO events to the new services (unchanged event names/payloads).
5. Remove mongoose/mongodb, update `package.json`, README, and produce an API test checklist.

## What I need from you to proceed
1. **MySQL version** you'll run (needs 8.0+ for `CHECK`, `JSON`, and `SELECT ... FOR UPDATE`
   semantics used here). If you're on MariaDB or MySQL 5.7, tell me — some DDL changes.
2. Run `schema.sql` against a fresh database and paste any error (or "created OK").
   ```sql
   CREATE DATABASE cinebooker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   USE cinebooker;
   SOURCE db/schema.sql;
   ```
3. Confirm you want me to keep the exact REST responses (default: yes).

Once the schema is in, I'll ship Stage 2 (pool + transaction helper) and the first
vertical slice (auth) so you can log in against MySQL, then we move through booking and
waitlist.
