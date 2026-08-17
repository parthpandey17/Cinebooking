# CineBooker — Production Deployment Guide

## Topology
```
React (Vercel)  ──HTTPS──▶  Node API (Render/Railway/EC2)  ──▶  MySQL 8 (managed)
                    ▲                       │
                    └──── Socket.IO (WS) ───┘
Razorpay ──webhook──▶ /payment/webhook        Resend ◀── outbound email
```

## 1. Provision MySQL 8
Any managed MySQL 8 works (PlanetScale-compatible caveat below, AWS RDS, Railway
MySQL, Aiven, etc.). Then load schema (and optionally seed):
```bash
mysql -h <host> -u <user> -p <db> < db/schema.sql
# production: DO NOT run seed.sql (it TRUNCATEs). Seed only staging/demo.
```
> **PlanetScale note:** it disallows FOREIGN KEY constraints. This schema relies on
> real FKs + `SELECT ... FOR UPDATE`, so prefer RDS/Railway/Aiven/self-managed MySQL.
> InnoDB is required (row locks + transactions).

## 2. Configure environment
Set these on the API host (see `.env.example` for the full list):
```
NODE_ENV=production
PORT=8080
DB_HOST=... DB_PORT=3306 DB_USER=... DB_PASSWORD=... DB_NAME=cinebooker
JWT_SECRET=<long-random-string>      JWT_EXPIRE=30d
PRICE_PER_SEAT=150
SEAT_LOCK_MINUTES=5  WAITLIST_OFFER_MINUTES=10
CANCEL_CUTOFF_HOURS=6 CANCELLATION_FEE_PERCENT=15
RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=... RAZORPAY_WEBHOOK_SECRET=...
RESEND_API_KEY=... RESEND_FROM_EMAIL="CineBooker <noreply@yourdomain>"
FRONTEND_URLS=https://your-frontend.vercel.app,https://cinebooking-system.vercel.app
```
- `FRONTEND_URLS` is a comma-separated allowlist; `*.vercel.app` preview subdomains
  are auto-allowed by the CORS logic.
- Generate `JWT_SECRET` with `openssl rand -hex 32`.

## 3. Deploy the API
- **Build/start:** no build step; `npm ci && npm start` (`node src/server.js`).
- **Health check:** point the platform's health probe at `GET /health` (returns 503
  until MySQL is reachable — the process also exits 1 on a failed startup check).
- **WebSockets:** ensure the platform allows upgraded connections (Render/Railway do).
  Socket.IO shares the HTTP port.

### Render example
- Service type: Web Service, Node.
- Start command: `npm start`. Health check path: `/health`.
- Add all env vars above. Set `NODE_ENV=production`.

### Docker example
The included `Dockerfile` runs `node src/server.js`. `docker-compose.yml` is for local
dev (bundles MySQL + phpMyAdmin); in production point `DB_*` at your managed database
instead of the compose MySQL.

## 4. Razorpay webhook
1. Dashboard → Webhooks → add `https://<api-host>/payment/webhook`.
2. Set the secret to match `RAZORPAY_WEBHOOK_SECRET`.
3. Subscribe to: `payment.captured`, `order.paid`, `invoice.paid`,
   `payment.failed`, `invoice.expired`, `refund.processed`, `refund.failed`.
The route verifies the HMAC over the **raw** body, so keep it reachable without any
body-rewriting proxy in front of it.

## 5. Email (Resend)
Verify your sending domain in Resend and set `RESEND_FROM_EMAIL` to an address on it.
Without `RESEND_API_KEY`, sends are recorded in `email_logs` as `skipped` and never
block bookings — safe for a first deploy.

## 6. Background jobs
The node-cron scheduler runs **inside** the API process (1-min lock/offer sweep,
15-min reminders), guarded against overlap and DB outages.
> If you run **multiple API replicas**, the sweep will run on each. It is safe
> (idempotent, row-locked) but redundant. To run it once, either keep a single
> replica for the cron role or gate `startSchedulers()` behind an env flag
> (e.g. `RUN_CRON=true`) on one instance.

## 7. Scaling & operations
- **Statelessness:** the API keeps no in-memory booking state; all concurrency is in
  MySQL (row locks + unique constraints), so you can scale replicas horizontally
  (mind the cron note above). The only in-memory piece is the simple auth rate-limiter,
  which is per-instance.
- **Connection pool:** `mysql2` pool sizing is driven by the pool config in
  `src/db/pool.js`; keep `connectionLimit × replicas` under your DB's `max_connections`.
- **Graceful shutdown:** `SIGTERM`/`SIGINT` close the HTTP server then the MySQL pool.
- **Backups:** enable automated MySQL backups; bookings/tickets/payments are
  `ON DELETE RESTRICT` and never cascade-deleted, but backups protect against
  operator error.

## 8. Security checklist
- [ ] Strong, unique `JWT_SECRET`; rotate on suspected leak (invalidates sessions).
- [ ] DB user scoped to the app schema only; TLS to the database if offered.
- [ ] `helmet` is enabled; serve the API over HTTPS (platform-terminated is fine).
- [ ] Restrict `FRONTEND_URLS` to your real origins.
- [ ] Never deploy `seed.sql` to production (it truncates and creates demo logins).
- [ ] Keep Razorpay/Resend secrets in the platform's secret store, not in the repo.
