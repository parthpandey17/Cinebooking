# CineBooker — Verification Checklist

This project was built and **statically** verified in an environment **without** a
live MySQL, Razorpay, or Resend. Nothing below is pre-filled with fake "green"
output — run these on your machine to confirm runtime behaviour.

## What was already verified during the build
- [x] All 69 `src/*.js` files pass `node --check` (syntax).
- [x] Zero unresolved internal `require()`s (custom resolver).
- [x] Every external dependency is declared in `package.json`; mongoose/mongodb removed.
- [x] Pure unit logic (seat math, `AppError`) passes assertions (8/8).

## 1. Static checks (no DB needed) — reproduce them
```bash
# syntax of every source file
find src -name '*.js' -exec node --check {} \;

# unit tests only (these run without a database)
npx jest tests/unit
```

## 2. Bring up the database
**Docker (recommended):**
```bash
cp .env.example .env
docker compose up --build      # loads schema.sql + seed.sql automatically
```
**Or local MySQL:**
```bash
mysql -u root -p -e "CREATE DATABASE cinebooker CHARACTER SET utf8mb4;"
mysql -u root -p cinebooker < db/schema.sql
mysql -u root -p cinebooker < db/seed.sql
```
Confirm the schema loaded:
```bash
mysql -u root -p cinebooker -e "SHOW TABLES;"          # expect 15 tables
mysql -u root -p cinebooker -e "SELECT username, role FROM users;"  # admin + user
```

## 3. Boot the API
```bash
npm install
npm run dev
curl -s http://localhost:8080/health        # {"success":true,"status":"ok","db":true}
```

## 4. Smoke-test the core flow (Postman or curl)
Import `postman/CineBooker.postman_collection.json`, then:
- [ ] `POST /auth/login` (user/user123) → returns a token
- [ ] `GET /movie`, `GET /showtime` → seeded catalog
- [ ] `POST /seatlock/lock` `{ "showtimeId":1, "seats":["C5","C6"] }` → 200
- [ ] `POST /payment/create-order` for the same seats → returns `orderId`
      (with no lock held it must return **400 + `expiredSeats`**)
- [ ] Admin login (admin/admin123) → `GET /admin/stats` → dashboard numbers

## 5. Full integration tests (needs the running DB from step 2)
```bash
npm test        # runs tests/unit + tests/integration
```
Integration tests auto-skip if MySQL is unreachable; with a live DB they exercise
auth, catalog, seat-lock, and the create-order guard over real HTTP.

## 6. Concurrency proof (the headline claim)
```bash
node scripts/stress-test.js 50 1 Z 9
```
Expected: `won (committed): 1`, `seat rows in table: 1`, `errors: 0`, and a
`✅ PASS` line — one seat booked exactly once despite 50 concurrent attempts.

## 7. Payments & email (optional, needs real credentials)
- Set `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` in `.env` for live orders/refunds.
- Point a Razorpay webhook at `POST /payment/webhook` (raw body; HMAC verified).
- Set `RESEND_API_KEY` (+ verified `RESEND_FROM_EMAIL`) for real emails; otherwise
  sends are recorded in `email_logs` with status `skipped` and never block bookings.

## 8. Scheduler
Leave the server running ~1 minute and confirm expired locks disappear:
```bash
mysql -u root -p cinebooker -e "SELECT COUNT(*) FROM seat_locks WHERE locked_until <= NOW();"
```
Should trend to 0 as the cron sweep runs (and affected waitlists get processed).
