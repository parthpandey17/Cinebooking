'use strict'
// The frontend expects Mongo-style `_id` strings. Repositories return SQL rows
// with numeric `id`/`*_id` columns; these helpers alias them to `_id` (as strings)
// and drop snake_case internals where a mapper is provided, so REST responses keep
// the exact shape the frontend already consumes.
const idStr = (v) => (v === null || v === undefined ? v : String(v))

// Attach `_id` (string) from a row's `id`, keeping other camelCase fields intact.
function withId(obj) {
	if (!obj) return obj
	const { id, ...rest } = obj
	return { _id: idStr(id), ...rest }
}
function withIds(rows) {
	return (rows || []).map(withId)
}

module.exports = { idStr, withId, withIds }
