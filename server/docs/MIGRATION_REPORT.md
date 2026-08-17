# CineBooker — MongoDB → MySQL Migration Report

## Summary
The backend was fully re-platformed from MongoDB/Mongoose to **MySQL 8** with raw
SQL via `mysql2/promise` (prepared statements + transactions, **no ORM**). The HTTP
API, JSON response shapes, and Socket.IO event contract are unchanged, so the
existing React frontend runs without modification.

## Data model mapping
| Mongo collection (embedded shape) | MySQL table(s) |
|---|---|
| `User` (tickets[] embedded) | `users` (+ history derived from `tickets`) |
| `Movie` | `movies` (soft-delete) |
| `Cinema` (theaters[] refs) | `cinemas` (soft-delete) |
| `Theater` (showtimes[] refs, seatPlan{row,column}) | `theaters` (soft-delete) |
| `Showtime` (seats[{row,number,user}] embedded) | `showtimes` + `showtime_booked_seats` |
| `SeatLock` (TTL `expiresAt`) | `seat_locks` (`locked_until`, cron-swept) |
| `Payment` (seats[], ticketData, refund{}) | `payments` + `payment_seats` (refund columns inlined) |
| `Ticket` (seats[]) | `tickets` + `ticket_seats` |
| `Waitlist` (offeredSeats[], partialBookings[]) | `waitlists` + `waitlist_offered_seats` + `waitlist_partial_bookings` |
| `EmailLog` | `email_logs` |

**Embedded arrays became child tables** with FKs (`payment_seats`, `ticket_seats`,
`showtime_booked_seats`, `waitlist_offered_seats`, `waitlist_partial_bookings`).
Mongo `_id` (ObjectId) → `BIGINT AUTO_INCREMENT`; services alias `id`→`_id` (string)
on the way out so the frontend sees the same field names.

## Key behavioural translations
- **Atomic seat commit.** Mongo used a conditional `$push` guarded by an
  `$elemMatch` filter. MySQL uses `SELECT ... FOR UPDATE` on the showtime row plus a
  `UNIQUE(showtime_id, seat_row, seat_number)` constraint — the second racer gets
  `ER_DUP_ENTRY`. Same guarantee, enforced by the database.
- **Seat-lock expiry.** Mongo TTL index → `locked_until` column swept every minute
  by node-cron, which then re-runs the waitlist for affected showtimes.
- **FIFO waitlist claim.** Mongo `findOneAndUpdate(sort joinedAt)` →
  `SELECT ... ORDER BY joined_at LIMIT 1 FOR UPDATE` then `UPDATE`, inside one
  transaction, so exactly one processor wins a queued entry.
- **Idempotency.** Payment finalize is idempotent (re-runnable from webhook + verify);
  `tickets.payment_id` is UNIQUE; email sends are deduped via
  `email_logs.idempotency_key` (sparse unique).
- **HMAC webhook.** Razorpay signature is verified over the **raw** request bytes;
  the webhook route mounts `express.raw` before the global JSON parser.

## Deletion policy (explicit)
No cascade-deletion of financial/historical data. `ON DELETE RESTRICT` guards every
FK into `payments`, `tickets`, `showtime_booked_seats`, and waitlist history. Catalog
entities (`movies`, `cinemas`, `theaters`, `showtimes`) use **soft delete**
(`is_active` / `deleted_at`). Only `seat_locks` and pure child rows cascade.

## Intentional deviations (and why)
- **No `Screens`, `Seats`, `RefreshTokens`, `OAuth`, `Notifications`, `Admins` tables.**
  The original app never used them — a *theater* is the screen, *seats* are virtual
  (derived from `seat_plan_row` × `seat_plan_column`), auth is username/password + a
  30-day JWT (no refresh token / no OAuth), and admin is a `users.role` value.
- **Legacy "payment-less ticket" merge dropped.** That code existed only to paper
  over historical Mongo rows; a fresh MySQL database has none.

## Verification performed
- Every one of the **69** `src/*.js` files passes `node --check`.
- A custom resolver confirms **zero** unresolved internal `require()`s.
- A dependency audit confirms **every** external `require` is declared in
  `package.json` (mongoose/mongodb fully removed).
- Pure unit logic (seat math, error typing) verified green via assertions.

## Not verified here (requires your environment)
No live MySQL/Razorpay was available in the build environment, so **runtime**
behaviour (actual queries executing, end-to-end booking, real Razorpay signatures)
was **not** executed and is **not** claimed. `VERIFICATION_CHECKLIST.md` lists the
exact commands to confirm it on your machine.
