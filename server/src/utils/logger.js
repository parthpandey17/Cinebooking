'use strict'
// Minimal structured logger (no external dep). Emits single-line JSON in prod,
// pretty text in dev.
const isProd = (process.env.NODE_ENV === 'production')
const write = (level, msg, meta) => {
	const rec = { ts: new Date().toISOString(), level, msg, ...(meta || {}) }
	if (isProd) console[level === 'error' ? 'error' : 'log'](JSON.stringify(rec))
	else console[level === 'error' ? 'error' : 'log'](`[${rec.ts}] ${level.toUpperCase()} ${msg}`, meta ? meta : '')
}
module.exports = {
	info: (m, meta) => write('info', m, meta),
	warn: (m, meta) => write('warn', m, meta),
	error: (m, meta) => write('error', m, meta),
	debug: (m, meta) => { if (!isProd) write('debug', m, meta) }
}
