# CineBooker MySQL Migration — Status

## ✅ Backend: CODE-COMPLETE & statically verified
- **69** source files under `src/`, all pass `node --check`.
- **Zero** unresolved internal `require()`s.
- **Every** external dependency declared in `package.json` (mongoose/mongodb removed).
- Pure unit logic (seat math, error typing) passes assertions.

### Modules migrated (controller → service → repository, raw SQL, transactions)
- **Auth** — register/login (bcrypt + 30-day JWT, cookie or Bearer), me, tickets, admin user mgmt.
- **Catalog** — movies, cinemas, theaters, showtimes (nested shapes preserved; soft-delete; admin unreleased variants; daily-repeat showtime creation).
- **Availability** — shared booked/locked/available SQL used across seat-lock, payment, waitlist.
- **Seat locks** — `locked_until` + `UNIQUE(showtime_id, seat_label)`; lock/unlock/verify/validate/cleanup; ACCEPTED-offer sync.
- **Payment** — Razorpay orders, HMAC verify, raw-body webhook (idempotent), `finalizeBooking` (`SELECT ... FOR UPDATE` + unique-seat backstop), cancel, status.
- **Ticket** — idempotent creation with QR, hydrated populated shape, my/by-showtime/admin lists, venue scan/validate.
- **Cancel/Refund** — 6h cutoff + 15% fee, Razorpay refund then atomic ticket-cancel + seat-release, admin refunds, refund webhook.
- **Waitlist engine** — FIFO `ORDER BY joined_at LIMIT 1 FOR UPDATE` claim, offer creation/expiry, `completeWaitlistForBooking` (single-source-of-truth counts).
- **Waitlist user layer** — join/status/my/accept(full+partial book_and_stay/book_and_leave/decline)/leave, admin all/stats.
- **Admin** — SQL dashboard aggregates, paginated payments, active locks, force-release, admin showtimes.
- **Email** — Resend send + `email_logs` idempotency, fire-and-forget `sendEmailSafely`, reminder service, admin logs/run.
- **Scheduler** — node-cron (1-min lock/offer sweep, 15-min reminders), overlap-guarded, health-gated.
- **App/Server** — CORS (+ Vercel preview subdomains), raw webhook mount before JSON, Socket.IO rooms, health-gated startup, graceful shutdown.

## ✅ Database
- `db/schema.sql` — 15 tables, InnoDB/utf8mb4, FKs, indexes, soft-delete, `ON DELETE RESTRICT` on all historical/financial FKs, unique double-booking guard.
- `db/seed.sql` — 2 logins (admin/admin123, user/user123 — real bcrypt), 6 movies, 3 cinemas, 9 theaters, 11 showtimes, sample booked seats.

## ✅ Deliverables
- `postman/CineBooker.postman_collection.json` — every endpoint, auto-token scripts.
- `tests/unit/*` (run without DB) + `tests/integration/*` (Supertest, auto-skip w/o DB).
- `scripts/stress-test.js` — concurrent double-booking proof.
- `docs/ER_DIAGRAM.md` (mermaid), `docs/MIGRATION_REPORT.md`, `docs/ARCHITECTURE.md`, `docs/SQL_INDEXES.md`, `docs/DEPLOYMENT.md`.
- `README.md`, `VERIFICATION_CHECKLIST.md`, `.env.example`, `Dockerfile`, `docker-compose.yml`.

## ⚠️ Not runtime-verified in the build environment
No live MySQL/Razorpay/Resend was available here, so end-to-end execution was **not**
run and is **not** claimed. `VERIFICATION_CHECKLIST.md` has the exact commands to
confirm everything on your machine (docker compose up → smoke tests → `npm test` →
stress test).
