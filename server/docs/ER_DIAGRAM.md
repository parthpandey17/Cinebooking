# CineBooker — Entity-Relationship Diagram (MySQL)

15 tables, InnoDB, `utf8mb4`. All PKs are `BIGINT AUTO_INCREMENT`.
Soft-delete (`is_active` / `deleted_at`) on catalog tables; `ON DELETE RESTRICT`
into every historical/financial FK so bookings, tickets, payments and refunds are
never cascade-deleted. Only pure child rows and `seat_locks` cascade.

```mermaid
erDiagram
    users ||--o{ payments : places
    users ||--o{ tickets : owns
    users ||--o{ waitlists : joins
    users ||--o{ seat_locks : holds
    users ||--o{ showtime_booked_seats : books
    users ||--o{ tickets : "scans (used_by)"

    cinemas ||--o{ theaters : has
    theaters ||--o{ showtimes : screens
    movies ||--o{ showtimes : "shown as"

    showtimes ||--o{ showtime_booked_seats : "committed seats"
    showtimes ||--o{ seat_locks : "temporary holds"
    showtimes ||--o{ payments : for
    showtimes ||--o{ tickets : for
    showtimes ||--o{ waitlists : for

    payments ||--o{ payment_seats : "seat lines"
    payments ||--|| tickets : "yields (1:1)"
    tickets ||--o{ ticket_seats : "seat lines"
    tickets ||--o{ showtime_booked_seats : "links (nullable)"

    waitlists ||--o{ waitlist_offered_seats : offers
    waitlists ||--o{ waitlist_partial_bookings : "fulfilment log"

    users ||--o{ email_logs : recipient
    showtimes ||--o{ email_logs : about
    tickets ||--o{ email_logs : about

    users {
      bigint id PK
      varchar username UK
      varchar email UK
      enum role
      varchar password
    }
    movies {
      bigint id PK
      varchar name
      int length
      varchar img
      tinyint is_active
      datetime deleted_at
    }
    cinemas {
      bigint id PK
      varchar name UK
      tinyint is_active
    }
    theaters {
      bigint id PK
      bigint cinema_id FK
      int number
      varchar seat_plan_row
      int seat_plan_column
      tinyint is_active
    }
    showtimes {
      bigint id PK
      bigint theater_id FK
      bigint movie_id FK
      datetime show_datetime
      tinyint is_release
      tinyint is_active
    }
    showtime_booked_seats {
      bigint id PK
      bigint showtime_id FK
      varchar seat_row
      int seat_number
      bigint user_id FK
      bigint ticket_id FK "nullable"
    }
    seat_locks {
      bigint id PK
      bigint user_id FK
      bigint showtime_id FK
      varchar seat_label
      datetime locked_until
    }
    payments {
      bigint id PK
      varchar razorpay_order_id UK
      varchar razorpay_payment_id
      int amount "paise"
      enum status
      bigint user_id FK
      bigint showtime_id FK
      json ticket_data
      tinyint webhook_processed
      varchar refund_razorpay_id
    }
    payment_seats {
      bigint id PK
      bigint payment_id FK
      varchar seat_row
      int seat_number
    }
    tickets {
      bigint id PK
      varchar ticket_id UK
      bigint payment_id FK "UK 1:1"
      bigint user_id FK
      bigint showtime_id FK
      decimal amount_paid "INR"
      varchar razorpay_payment_id
      text qr_payload
      tinyint is_used
      bigint used_by FK
      tinyint is_cancelled
    }
    ticket_seats {
      bigint id PK
      bigint ticket_id FK
      varchar seat_row
      int seat_number
    }
    waitlists {
      bigint id PK
      bigint user_id FK
      bigint showtime_id FK
      int seats_requested
      int seats_accepted
      int seats_remaining
      enum status
      datetime joined_at
      datetime offer_expires_at
      tinyint close_after_booking
    }
    waitlist_offered_seats {
      bigint id PK
      bigint waitlist_id FK
      varchar seat_label
    }
    waitlist_partial_bookings {
      bigint id PK
      bigint waitlist_id FK
      int seats_booked
      json seat_labels
    }
    email_logs {
      bigint id PK
      varchar type
      varchar recipient
      bigint user_id FK
      bigint ticket_ref FK
      bigint showtime_id FK
      enum status
      varchar idempotency_key UK
    }
```

## Concurrency-critical constraints
- `UNIQUE(showtime_id, seat_row, seat_number)` on **showtime_booked_seats** — the
  hard double-booking guard. Two payments racing for one seat: the second `INSERT`
  fails with `ER_DUP_ENTRY`, so a seat is committed **exactly once**.
- `UNIQUE(showtime_id, seat_label)` on **seat_locks** — one active hold per seat.
- `UNIQUE(user_id, showtime_id)` on **waitlists** — one waitlist entry per user/showtime.
- `UNIQUE(idempotency_key)` on **email_logs** (sparse; MySQL allows multiple NULLs) —
  idempotent email sends.
- `UNIQUE(payment_id)` on **tickets** — a payment yields at most one ticket (idempotent finalize).
