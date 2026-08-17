'use strict'
const mysql = require('mysql2/promise')
const config = require('../config')
const logger = require('../utils/logger')

// Single shared connection pool. Prepared statements are used everywhere via
// pool.execute()/conn.execute() which sends parameterised queries to MySQL.
const pool = mysql.createPool({
	host: config.db.host,
	port: config.db.port,
	user: config.db.user,
	password: config.db.password,
	database: config.db.database,
	waitForConnections: true,
	connectionLimit: config.db.connectionLimit,
	queueLimit: 0,
	timezone: config.db.timezone,
	charset: 'utf8mb4',
	dateStrings: false,
	namedPlaceholders: false,
	supportBigNumbers: true,
	bigNumberStrings: false
})

// Convenience helpers. `query` returns rows for SELECT.
async function query(sql, params = []) {
	const [rows] = await pool.execute(sql, params)
	return rows
}
async function queryOne(sql, params = []) {
	const rows = await query(sql, params)
	return rows[0] || null
}

async function healthCheck() {
	const [rows] = await pool.query('SELECT 1 AS ok')
	return rows[0] && rows[0].ok === 1
}

async function close() {
	await pool.end()
	logger.info('MySQL pool closed')
}

module.exports = { pool, query, queryOne, healthCheck, close }
