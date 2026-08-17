# CineBooker — SQL Index Reference

Every index in `db/schema.sql`, the query pattern it serves, and why it matters.
All PKs are the clustered `BIGINT AUTO_INCREMENT id` (omitted below). "UK" = unique.

## users
| Index | Columns | Serves |
|---|---|---|
| `uq_users_username` (UK) | `username` | login by username; uniqueness guard |
| `uq_users_email` (UK) | `email` | registration/email lookup; uniqueness guard |

## movies / cinemas / theaters / showtimes (catalog, soft-deleted)
| Index | Columns | Serves |
|---|---|---|
| `idx_movies_active` | `is_active` | list only non-deleted movies |
| `uq_cinemas_name` (UK) | `name` | cinema name uniqueness |
| `idx_cinemas_active` | `is_active` | active-cinema listings |
| `idx_theaters_cinema` | `cinema_id` | theaters-of-a-cinema joins (FK) |
| `idx_theaters_active` | `is_active` | active-theater filter |
| `idx_showtimes_theater` | `theater_id` | showtimes-of-a-theater joins (FK) |
| `idx_showtimes_movie` | `movie_id` | showtimes-of-a-movie joins (FK) |
| `idx_showtimes_datetime` | `show_datetime` | "upcoming showtimes", reminder window, hiding started shows |
| `idx_showtimes_active` | `is_active` | active-showtime filter |

## showtime_booked_seats (committed seats)
| Index | Columns | Serves |
|---|---|---|
| **`uq_booked_seat` (UK)** | `showtime_id, seat_row, seat_number` | **the double-booking guard** — a racing second insert fails with `ER_DUP_ENTRY` |
| `idx_booked_showtime` | `showtime_id` | availability computation per showtime (FK) |
| `idx_booked_user` | `user_id` | per-user booked seats (FK) |
| `idx_booked_ticket` | `ticket_id` | link seats to their ticket after finalize (FK) |

## seat_locks (temporary holds; replaces Mongo TTL)
| Index | Columns | Serves |
|---|---|---|
| **`uq_lock_seat` (UK)** | `showtime_id, seat_label` | one active hold per seat; `insertLock` conflict → 409 |
| `idx_lock_expiry` | `locked_until` | cron sweep of expired locks; `expiredShowtimeIds` |
| `idx_lock_user_showtime` | `user_id, showtime_id` | a user's holds for a showtime (refresh/verify/delete) |

## payments
| Index | Columns | Serves |
|---|---|---|
| `uq_payments_order` (UK) | `razorpay_order_id` | webhook/verify lookup by order; idempotency |
| `idx_payments_user` | `user_id` | user payment history (FK) |
| `idx_payments_showtime` | `showtime_id` | paid-seat checks per showtime (FK) |
| `idx_payments_status` | `status` | admin payments filter; paid-seat aggregation |

## payment_seats / ticket_seats (embedded arrays → child rows)
| Index | Columns | Serves |
|---|---|---|
| `idx_payment_seats_payment` | `payment_id` | seat lines for a payment (FK) |
| `idx_ticket_seats_ticket` | `ticket_id` | seat lines for a ticket (FK) |

## tickets
| Index | Columns | Serves |
|---|---|---|
| `uq_tickets_ticketid` (UK) | `ticket_id` | scan/lookup by `TKT-XXXXXXXX` |
| **`uq_tickets_payment` (UK)** | `payment_id` | 1 ticket per payment — idempotent finalize |
| `idx_tickets_user_booked` | `user_id, booked_at` | "my tickets", newest-first, without a filesort |
| `idx_tickets_showtime_used` | `showtime_id, is_used` | venue scan dashboard (used/unused) |
| `idx_tickets_showtime_cancelled` | `showtime_id, is_cancelled` | revenue/seat aggregates excluding cancellations |

## waitlists
| Index | Columns | Serves |
|---|---|---|
| `uq_waitlist_user_showtime` (UK) | `user_id, showtime_id` | one entry per user/showtime; upsert-on-rejoin |
| **`idx_waitlist_fifo`** | `showtime_id, status, joined_at` | **the FIFO claim** — `WHERE showtime_id=? AND status='WAITLISTED' ORDER BY joined_at LIMIT 1 FOR UPDATE` uses this composite directly |
| `idx_waitlist_status` | `status` | admin stats grouping |
| `idx_waitlist_offer_expiry` | `offer_expires_at` | cron expiry of stale offers |

## waitlist_offered_seats / waitlist_partial_bookings
| Index | Columns | Serves |
|---|---|---|
| `idx_offered_seats_waitlist` | `waitlist_id` | offered-seat labels per entry (FK) |
| `idx_partial_waitlist` | `waitlist_id` | partial-fulfilment log per entry (FK) |

## email_logs
| Index | Columns | Serves |
|---|---|---|
| `uq_email_idempotency` (UK) | `idempotency_key` | dedupe sends (sparse — MySQL allows many NULLs) |
| `idx_email_type` / `idx_email_recipient` / `idx_email_status` | resp. | admin log filtering |

## Notes on the hot paths
- The two constraints that make concurrency safe are `uq_booked_seat` and
  `uq_lock_seat`; the two composites that keep the hot reads index-only are
  `idx_waitlist_fifo` and `idx_tickets_user_booked`.
- FK columns are individually indexed so `ON DELETE RESTRICT` checks and JOINs never
  table-scan.
