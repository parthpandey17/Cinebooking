-- ============================================================================
--  CineBooker — MySQL schema  (MongoDB → MySQL migration)
--  Target: MySQL 8.0+  (InnoDB, utf8mb4)
--
--  Delete policy (per requirements):
--   * NEVER cascade-delete financial/historical data (payments, tickets, bookings).
--   * Referenced catalog entities (movies, cinemas, theaters, showtimes) use
--     SOFT DELETE: is_active + deleted_at. They are never physically deleted.
--   * FKs into catalog/history use ON DELETE RESTRICT so a physical delete of a
--     referenced row is impossible (the app soft-deletes instead).
--   * Only ephemeral rows (seat_locks) and pure child rows that belong 1:1 to a
--     parent (…_seats, waitlist_offered_seats, waitlist_partial_bookings) cascade.
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS email_logs;
DROP TABLE IF EXISTS waitlist_partial_bookings;
DROP TABLE IF EXISTS waitlist_offered_seats;
DROP TABLE IF EXISTS waitlists;
DROP TABLE IF EXISTS ticket_seats;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS payment_seats;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS seat_locks;
DROP TABLE IF EXISTS showtime_booked_seats;
DROP TABLE IF EXISTS showtimes;
DROP TABLE IF EXISTS theaters;
DROP TABLE IF EXISTS cinemas;
DROP TABLE IF EXISTS movies;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ─── users ──────────────────────────────────────────────────────────────────
CREATE TABLE users (
	id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	username   VARCHAR(255)    NOT NULL,
	email      VARCHAR(255)    NOT NULL,
	role       ENUM('user','admin') NOT NULL DEFAULT 'user',
	password   VARCHAR(255)    NOT NULL,
	created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_users_username (username),
	UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── movies (soft-delete) ───────────────────────────────────────────────────
CREATE TABLE movies (
	id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	name       VARCHAR(255)    NOT NULL,
	length     INT             NOT NULL,
	img        TEXT            NOT NULL,
	is_active  TINYINT(1)      NOT NULL DEFAULT 1,
	deleted_at DATETIME        NULL,
	created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_movies_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── cinemas (soft-delete) ──────────────────────────────────────────────────
CREATE TABLE cinemas (
	id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	name       VARCHAR(255)    NOT NULL,
	is_active  TINYINT(1)      NOT NULL DEFAULT 1,
	deleted_at DATETIME        NULL,
	created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_cinemas_name (name),
	KEY idx_cinemas_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── theaters (soft-delete; a.k.a. screen) ──────────────────────────────────
CREATE TABLE theaters (
	id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	cinema_id        BIGINT UNSIGNED NOT NULL,
	number           INT             NOT NULL,
	seat_plan_row    VARCHAR(2)      NOT NULL,
	seat_plan_column INT             NOT NULL,
	is_active        TINYINT(1)      NOT NULL DEFAULT 1,
	deleted_at       DATETIME        NULL,
	created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_theaters_cinema (cinema_id),
	KEY idx_theaters_active (is_active),
	CONSTRAINT fk_theaters_cinema FOREIGN KEY (cinema_id)
		REFERENCES cinemas (id) ON DELETE RESTRICT ON UPDATE CASCADE,
	CONSTRAINT chk_theater_column CHECK (seat_plan_column BETWEEN 1 AND 120)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── showtimes (soft-delete) ────────────────────────────────────────────────
CREATE TABLE showtimes (
	id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	theater_id    BIGINT UNSIGNED NOT NULL,
	movie_id      BIGINT UNSIGNED NOT NULL,
	show_datetime DATETIME        NOT NULL,
	is_release    TINYINT(1)      NOT NULL DEFAULT 1,
	is_active     TINYINT(1)      NOT NULL DEFAULT 1,
	deleted_at    DATETIME        NULL,
	created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_showtimes_theater (theater_id),
	KEY idx_showtimes_movie (movie_id),
	KEY idx_showtimes_datetime (show_datetime),
	KEY idx_showtimes_active (is_active),
	CONSTRAINT fk_showtimes_theater FOREIGN KEY (theater_id)
		REFERENCES theaters (id) ON DELETE RESTRICT ON UPDATE CASCADE,
	CONSTRAINT fk_showtimes_movie FOREIGN KEY (movie_id)
		REFERENCES movies (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── showtime_booked_seats (authoritative booking record) ───────────────────
CREATE TABLE showtime_booked_seats (
	id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	showtime_id BIGINT UNSIGNED NOT NULL,
	seat_row    VARCHAR(2)      NOT NULL,
	seat_number INT             NOT NULL,
	user_id     BIGINT UNSIGNED NULL,
	ticket_id   BIGINT UNSIGNED NULL,
	created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_booked_seat (showtime_id, seat_row, seat_number),
	KEY idx_booked_showtime (showtime_id),
	KEY idx_booked_user (user_id),
	KEY idx_booked_ticket (ticket_id),
	CONSTRAINT fk_booked_showtime FOREIGN KEY (showtime_id)
		REFERENCES showtimes (id) ON DELETE RESTRICT ON UPDATE CASCADE,
	CONSTRAINT fk_booked_user FOREIGN KEY (user_id)
		REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── seat_locks (ephemeral; locked_until replaces Mongo TTL) ─────────────────
CREATE TABLE seat_locks (
	id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	user_id      BIGINT UNSIGNED NOT NULL,
	showtime_id  BIGINT UNSIGNED NOT NULL,
	seat_label   VARCHAR(8)      NOT NULL,
	locked_until DATETIME        NOT NULL,
	created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_lock_seat (showtime_id, seat_label),
	KEY idx_lock_expiry (locked_until),
	KEY idx_lock_user_showtime (user_id, showtime_id),
	CONSTRAINT fk_lock_user FOREIGN KEY (user_id)
		REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT fk_lock_showtime FOREIGN KEY (showtime_id)
		REFERENCES showtimes (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── payments (historical — never cascade-deleted) ──────────────────────────
CREATE TABLE payments (
	id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	razorpay_order_id       VARCHAR(255)    NOT NULL,
	razorpay_payment_id     VARCHAR(255)    NULL,
	razorpay_signature      VARCHAR(255)    NULL,
	amount                  BIGINT          NOT NULL,
	currency                VARCHAR(8)      NOT NULL DEFAULT 'INR',
	status                  ENUM('created','paid','failed','cancelled','refunded') NOT NULL DEFAULT 'created',
	user_id                 BIGINT UNSIGNED NOT NULL,
	showtime_id             BIGINT UNSIGNED NOT NULL,
	ticket_data             JSON            NULL,
	webhook_processed       TINYINT(1)      NOT NULL DEFAULT 0,
	refund_razorpay_id      VARCHAR(255)    NULL,
	refund_amount           BIGINT          NULL,
	refund_cancellation_fee BIGINT          NULL,
	refund_fee_percent      INT             NULL DEFAULT 15,
	refund_at               DATETIME        NULL,
	refund_status           VARCHAR(32)     NULL,
	refund_reason           VARCHAR(500)    NULL,
	created_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_payments_order (razorpay_order_id),
	KEY idx_payments_user (user_id),
	KEY idx_payments_showtime (showtime_id),
	KEY idx_payments_status (status),
	CONSTRAINT fk_payments_user FOREIGN KEY (user_id)
		REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
	CONSTRAINT fk_payments_showtime FOREIGN KEY (showtime_id)
		REFERENCES showtimes (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payment_seats (
	id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	payment_id  BIGINT UNSIGNED NOT NULL,
	seat_row    VARCHAR(2)      NOT NULL,
	seat_number INT             NOT NULL,
	PRIMARY KEY (id),
	KEY idx_payment_seats_payment (payment_id),
	CONSTRAINT fk_payment_seats_payment FOREIGN KEY (payment_id)
		REFERENCES payments (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── tickets (historical — never cascade-deleted) ───────────────────────────
CREATE TABLE tickets (
	id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	ticket_id           VARCHAR(32)     NOT NULL,
	payment_id          BIGINT UNSIGNED NOT NULL,
	user_id             BIGINT UNSIGNED NOT NULL,
	showtime_id         BIGINT UNSIGNED NOT NULL,
	amount_paid         DECIMAL(10,2)   NOT NULL,
	razorpay_payment_id VARCHAR(255)    NULL,
	qr_code_data_url    LONGTEXT        NULL,
	qr_payload          TEXT            NULL,
	is_used             TINYINT(1)      NOT NULL DEFAULT 0,
	used_at             DATETIME        NULL,
	used_by             BIGINT UNSIGNED NULL,
	is_cancelled        TINYINT(1)      NOT NULL DEFAULT 0,
	cancelled_at        DATETIME        NULL,
	cancellation_reason VARCHAR(500)    NULL,
	refund_amount       DECIMAL(10,2)   NULL,
	cancellation_fee    DECIMAL(10,2)   NULL,
	booked_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_tickets_ticketid (ticket_id),
	UNIQUE KEY uq_tickets_payment (payment_id),
	KEY idx_tickets_user_booked (user_id, booked_at),
	KEY idx_tickets_showtime_used (showtime_id, is_used),
	KEY idx_tickets_showtime_cancelled (showtime_id, is_cancelled),
	CONSTRAINT fk_tickets_payment FOREIGN KEY (payment_id)
		REFERENCES payments (id) ON DELETE RESTRICT ON UPDATE CASCADE,
	CONSTRAINT fk_tickets_user FOREIGN KEY (user_id)
		REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
	CONSTRAINT fk_tickets_showtime FOREIGN KEY (showtime_id)
		REFERENCES showtimes (id) ON DELETE RESTRICT ON UPDATE CASCADE,
	CONSTRAINT fk_tickets_usedby FOREIGN KEY (used_by)
		REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_seats (
	id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	ticket_id   BIGINT UNSIGNED NOT NULL,
	seat_row    VARCHAR(2)      NOT NULL,
	seat_number INT             NOT NULL,
	PRIMARY KEY (id),
	KEY idx_ticket_seats_ticket (ticket_id),
	CONSTRAINT fk_ticket_seats_ticket FOREIGN KEY (ticket_id)
		REFERENCES tickets (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── waitlists ──────────────────────────────────────────────────────────────
CREATE TABLE waitlists (
	id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	user_id             BIGINT UNSIGNED NOT NULL,
	showtime_id         BIGINT UNSIGNED NOT NULL,
	seats_requested     INT             NOT NULL DEFAULT 1,
	seats_accepted      INT             NULL,
	seats_remaining     INT             NULL,
	status              ENUM('WAITLISTED','OFFERED','OFFER_PARTIAL','ACCEPTED',
	                         'CONFIRMED','EXPIRED','REJECTED','CANCELLED')
	                     NOT NULL DEFAULT 'WAITLISTED',
	position            INT             NULL,
	close_after_booking TINYINT(1)      NOT NULL DEFAULT 0,
	joined_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	offered_at          DATETIME        NULL,
	offer_expires_at    DATETIME        NULL,
	confirmed_at        DATETIME        NULL,
	created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_waitlist_user_showtime (user_id, showtime_id),
	KEY idx_waitlist_fifo (showtime_id, status, joined_at),
	KEY idx_waitlist_status (status),
	KEY idx_waitlist_offer_expiry (offer_expires_at),
	CONSTRAINT fk_waitlist_user FOREIGN KEY (user_id)
		REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
	CONSTRAINT fk_waitlist_showtime FOREIGN KEY (showtime_id)
		REFERENCES showtimes (id) ON DELETE RESTRICT ON UPDATE CASCADE,
	CONSTRAINT chk_waitlist_requested CHECK (seats_requested >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE waitlist_offered_seats (
	id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	waitlist_id BIGINT UNSIGNED NOT NULL,
	seat_label  VARCHAR(8)      NOT NULL,
	PRIMARY KEY (id),
	KEY idx_offered_seats_waitlist (waitlist_id),
	CONSTRAINT fk_offered_seats_waitlist FOREIGN KEY (waitlist_id)
		REFERENCES waitlists (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE waitlist_partial_bookings (
	id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	waitlist_id  BIGINT UNSIGNED NOT NULL,
	seats_booked INT             NOT NULL,
	seat_labels  JSON            NULL,
	booked_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	KEY idx_partial_waitlist (waitlist_id),
	CONSTRAINT fk_partial_waitlist FOREIGN KEY (waitlist_id)
		REFERENCES waitlists (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── email_logs ─────────────────────────────────────────────────────────────
CREATE TABLE email_logs (
	id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	type                ENUM('booking_confirmation','cancellation','reminder','waitlist_offer') NOT NULL,
	recipient           VARCHAR(255)    NOT NULL,
	user_id             BIGINT UNSIGNED NULL,
	ticket_ref          BIGINT UNSIGNED NULL,
	showtime_id         BIGINT UNSIGNED NULL,
	subject             VARCHAR(255)    NOT NULL,
	status              ENUM('sent','failed','skipped') NOT NULL,
	provider_message_id VARCHAR(255)    NULL,
	idempotency_key     VARCHAR(255)    NULL,
	error               TEXT            NULL,
	metadata            JSON            NULL,
	sent_at             DATETIME        NULL,
	created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (id),
	UNIQUE KEY uq_email_idempotency (idempotency_key),
	KEY idx_email_type (type),
	KEY idx_email_recipient (recipient),
	KEY idx_email_status (status),
	CONSTRAINT fk_email_user FOREIGN KEY (user_id)
		REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE,
	CONSTRAINT fk_email_ticket FOREIGN KEY (ticket_ref)
		REFERENCES tickets (id) ON DELETE SET NULL ON UPDATE CASCADE,
	CONSTRAINT fk_email_showtime FOREIGN KEY (showtime_id)
		REFERENCES showtimes (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
