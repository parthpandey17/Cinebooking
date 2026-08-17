# CineBooker — Backend (MySQL edition)

Movie-ticket booking API migrated from **MongoDB/Mongoose** to **MySQL 8** using
raw SQL (`mysql2/promise`, prepared statements, transactions — **no ORM**), in a
clean `controller → service → repository → db` architecture. All REST contracts,
response shapes and Socket.IO events are preserved from the original app so the
existing React frontend works unchanged.

## Stack
Node.js 18+ · Express · MySQL 8 (InnoDB, utf8mb4) · Socket.IO · node-cron ·
Razorpay (orders, HMAC webhooks, refunds) · Resend (email) · JWT auth (cookie **or** Bearer).

## Architecture
```
src/
  config/        env + constants
  db/            pool (mysql2), withTransaction() helper
  middleware/    auth (protect/authorize), errorHandler, rateLimiter
  repositories/  raw parameterised SQL ONLY (accept an optional txn conn)
  services/      business logic, AppError, _id aliasing, concurrency
  controllers/   thin HTTP handlers (asyncHandler)
  routes/        express routers (12 groups)
  sockets/       socketService (emitToUser / emitToShowtime)
  jobs/          node-cron scheduler (lock/offer cleanup, reminders)
  app.js         express app (CORS, helmet, raw webhook mount, routes)
  server.js      http + Socket.IO, health-gated startup, graceful shutdown
db/
  schema.sql     15 tables, FKs, indexes, soft-delete, unique guards
  seed.sql       demo data + admin/user logins (bcrypt hashes)
```
Repositories never contain business logic; services never write raw SQL by hand
outside a repository call; controllers stay thin. A repository method takes an
optional connection so it can either run on the pool or **join an open transaction**.

## Quick start (Docker — everything wired)
```bash
cp .env.example .env          # fill RAZORPAY_* / RESEND_* if you want live payments/email
docker compose up --build
# API      → http://localhost:8080   (schema.sql + seed.sql auto-loaded)
# phpMyAdmin → http://localhost:8081
```

## Quick start (local MySQL)
```bash
# 1. create the database + load schema and seed
mysql -u root -p -e "CREATE DATABASE cinebooker CHARACTER SET utf8mb4;"
mysql -u root -p cinebooker < db/schema.sql
mysql -u root -p cinebooker < db/seed.sql
# 2. configure + run
cp .env.example .env          # set DB_* and JWT_SECRET at minimum
npm install
npm run dev                   # or: npm start
```

### Seeded logins
| role  | username | password  |
|-------|----------|-----------|
| admin | `admin`  | `admin123`|
| user  | `user`   | `user123` |

## Environment (.env)
See `.env.example`. Key vars: `PORT`, `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`,
`JWT_SECRET`, `JWT_EXPIRE`, `PRICE_PER_SEAT` (default 150), `SEAT_LOCK_MINUTES` (5),
`WAITLIST_OFFER_MINUTES` (10), `CANCEL_CUTOFF_HOURS` (6), `CANCELLATION_FEE_PERCENT` (15),
`RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET`, `RESEND_API_KEY/RESEND_FROM_EMAIL`,
`FRONTEND_URLS` (comma-separated; `*.vercel.app` previews are auto-allowed).

Without `RAZORPAY_*` the payment endpoints can't create real orders; without
`RESEND_API_KEY` emails are **skipped and logged** (never crash the booking flow).

## Concurrency model (how double-booking is prevented)
- **Seat locks** replace Mongo TTL docs with a `locked_until` column; expired locks
  are swept every minute by node-cron, which then re-processes the waitlist.
- **Finalize booking** runs in a transaction: `SELECT ... FOR UPDATE` on the showtime
  row (pessimistic lock) **plus** a `UNIQUE(showtime_id, seat_row, seat_number)`
  backstop on `showtime_booked_seats`. A racing second booking hits `ER_DUP_ENTRY`,
  so each seat commits exactly once. Finalize is idempotent (safe to re-run from the
  webhook and the verify call).
- **FIFO waitlist** claims the oldest `WAITLISTED` row with
  `ORDER BY joined_at LIMIT 1 FOR UPDATE`, so concurrent processors can't offer the
  same seats twice.

See `scripts/stress-test.js` for a runnable proof.

## API surface (12 route groups)
`/auth` · `/movie` · `/cinema` · `/theater` · `/showtime` · `/seatlock` ·
`/payment` (+ raw-body `/payment/webhook`) · `/ticket` · `/cancel` · `/waitlist` ·
`/admin` · `/email`. Full request/response examples: import
`postman/CineBooker.postman_collection.json`.

## Tests
```bash
npm test                       # jest: unit (no DB) + integration (needs live MySQL)
node scripts/stress-test.js 50 1 Z 9   # concurrent double-booking proof (needs DB)
```
Unit tests (`tests/unit`) run without a database. Integration tests
(`tests/integration`) auto-skip if MySQL is unreachable and exercise the real HTTP
stack via Supertest when it is. **No test results are pre-baked** — run them against
your own MySQL.

## Migration notes
Full details in `docs/MIGRATION_REPORT.md` and `docs/ARCHITECTURE.md`; every index
is catalogued in `docs/SQL_INDEXES.md`; production setup is in `docs/DEPLOYMENT.md`;
and a step-by-step validation runbook is in `VERIFICATION_CHECKLIST.md`.
