'use strict'
// Singleton Socket.IO accessor. Event names / rooms / payloads are IDENTICAL to
// the Mongo version so the frontend listeners keep working unchanged.
let _io = null
const initSocket = (io) => { _io = io }
const getIO = () => { if (!_io) throw new Error('Socket.IO not initialised'); return _io }
const emitToUser = (userId, event, payload) => { if (_io) _io.to(`user:${String(userId)}`).emit(event, payload) }
const emitToShowtime = (showtimeId, event, payload) => { if (_io) _io.to(`showtime:${String(showtimeId)}`).emit(event, payload) }
module.exports = { initSocket, getIO, emitToUser, emitToShowtime }
