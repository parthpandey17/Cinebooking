-- ============================================================================
--  CineBooker — demo seed data  (run AFTER db/schema.sql)
--  Login credentials created by this seed:
--    admin  →  username: admin  password: admin123
--    user   →  username: user   password: user123
--  (password hashes are bcrypt, cost 10)
-- ============================================================================
SET NAMES utf8mb4;

-- Idempotent-ish: clear demo data first (respects FK order).
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE waitlist_partial_bookings;
TRUNCATE TABLE waitlist_offered_seats;
TRUNCATE TABLE waitlists;
TRUNCATE TABLE ticket_seats;
TRUNCATE TABLE tickets;
TRUNCATE TABLE payment_seats;
TRUNCATE TABLE payments;
TRUNCATE TABLE seat_locks;
TRUNCATE TABLE showtime_booked_seats;
TRUNCATE TABLE showtimes;
TRUNCATE TABLE theaters;
TRUNCATE TABLE cinemas;
TRUNCATE TABLE movies;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;

-- ── users ───────────────────────────────────────────────────────────────────
INSERT INTO users (id, username, email, role, password) VALUES
	(1, 'admin', 'admin@cinebooker.test', 'admin', '$2a$10$K5Ila08Jvp3JIbK/VjmVZuwy9kr9mAyS1VLvOvVGupksHPBmyfXH.'),
	(2, 'user',  'user@cinebooker.test',  'user',  '$2a$10$DDdTZ2v2CQotKRUz/EALdO4TJ.PDnfqo5GaN7WdMs.MncVdHsG8i6');

-- ── movies ──────────────────────────────────────────────────────────────────
INSERT INTO movies (id, name, length, img) VALUES
	(1, 'The First Adventure', 110, 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba'),
	(2, 'Mystery at Midnight',  95, 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c'),
	(3, 'Comedy Nights',       105, 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1'),
	(4, 'Space Journey',       130, 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564'),
	(5, 'Romantic Echoes',     100, 'https://images.unsplash.com/photo-1513104890138-7c749659a591'),
	(6, 'Animated Tales',       80, 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4');

-- ── cinemas ──────────────────────────────────────────────────────────────────
INSERT INTO cinemas (id, name) VALUES
	(1, 'Downtown Cinema'),
	(2, 'Uptown Cinema'),
	(3, 'Riverside Cinema');

-- ── theaters (3 per cinema; seat plan A..J x 12 = 120 seats) ─────────────────
INSERT INTO theaters (id, cinema_id, number, seat_plan_row, seat_plan_column) VALUES
	(1, 1, 1, 'J', 12), (2, 1, 2, 'J', 12), (3, 1, 3, 'H', 10),
	(4, 2, 1, 'J', 12), (5, 2, 2, 'H', 10), (6, 2, 3, 'F', 8),
	(7, 3, 1, 'J', 12), (8, 3, 2, 'H', 10), (9, 3, 3, 'F', 8);

-- ── showtimes ────────────────────────────────────────────────────────────────
-- A spread of upcoming showtimes over the next few days at 12:00 / 15:00 / 18:00.
INSERT INTO showtimes (theater_id, movie_id, show_datetime, is_release) VALUES
	(1, 1, DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 12 HOUR, 1),
	(1, 2, DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 15 HOUR, 1),
	(1, 3, DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 18 HOUR, 1),
	(2, 4, DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 12 HOUR, 1),
	(2, 5, DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 15 HOUR, 1),
	(4, 6, DATE_ADD(DATE(NOW()), INTERVAL 1 DAY) + INTERVAL 18 HOUR, 1),
	(1, 1, DATE_ADD(DATE(NOW()), INTERVAL 2 DAY) + INTERVAL 12 HOUR, 1),
	(2, 2, DATE_ADD(DATE(NOW()), INTERVAL 2 DAY) + INTERVAL 15 HOUR, 1),
	(4, 3, DATE_ADD(DATE(NOW()), INTERVAL 2 DAY) + INTERVAL 18 HOUR, 1),
	(7, 4, DATE_ADD(DATE(NOW()), INTERVAL 2 DAY) + INTERVAL 12 HOUR, 1),
	-- one unreleased (admin-only visible) showtime
	(3, 5, DATE_ADD(DATE(NOW()), INTERVAL 3 DAY) + INTERVAL 15 HOUR, 0);

-- A few pre-booked seats on the first showtime to exercise availability/UI.
INSERT INTO showtime_booked_seats (showtime_id, seat_row, seat_number, user_id) VALUES
	(1, 'A', 1, 2), (1, 'A', 2, 2), (1, 'B', 5, 2);
