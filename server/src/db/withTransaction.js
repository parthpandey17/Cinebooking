'use strict'
const { pool } = require('./pool')

// Runs `fn(conn)` inside a single transaction. Commits on success, rolls back on
// any thrown error, and always releases the connection. Repos accept an optional
// `conn` so their SQL joins the active transaction; when omitted they use the pool.
async function withTransaction(fn) {
	const conn = await pool.getConnection()
	try {
		await conn.beginTransaction()
		const result = await fn(conn)
		await conn.commit()
		return result
	} catch (err) {
		try { await conn.rollback() } catch (_) { /* ignore */ }
		throw err
	} finally {
		conn.release()
	}
}

// A runner that works with either a transaction conn or the pool.
const runner = (conn) => conn || pool

module.exports = { withTransaction, runner }
