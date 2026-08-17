import { ClockIcon, QueueListIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import axios from '../config/axiosConfig'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

const WaitlistPanel = ({ auth, isFull, showtime, autoOpen = false }) => {
	const navigate = useNavigate()
	const [entry, setEntry] = useState(null)
	const [loading, setLoading] = useState(false)
	const [secondsLeft, setSecondsLeft] = useState(0)
	const [joinSeats, setJoinSeats] = useState(1)
	const [showJoinForm, setShowJoinForm] = useState(false)

	// Only set the header when we actually have a token; otherwise let the axios
	// request interceptor attach it from storage. Passing `Bearer null` would be
	// rejected by the server with a 401.
	const headers = auth.token ? { Authorization: `Bearer ${auth.token}` } : {}

	const fetchStatus = async () => {
		if (!auth.token || auth.role !== 'user' || !showtime?._id) return
		try {
			const response = await axios.get(`/waitlist/${showtime._id}`, { headers })
			setEntry(response.data.data)
		} catch (err) {
			console.error('Waitlist status error:', err)
		}
	}

	useEffect(() => {
		fetchStatus()
		const timer = setInterval(fetchStatus, 15000)
		return () => clearInterval(timer)
	}, [auth.token, showtime?._id])

	useEffect(() => {
		if (autoOpen) setShowJoinForm(true)
	}, [autoOpen])

	// Countdown timer when an offer is active
	useEffect(() => {
		if (entry?.status !== 'OFFERED' || !entry.offerExpiresAt) return
		const update = () =>
			setSecondsLeft(Math.max(0, Math.floor((new Date(entry.offerExpiresAt) - new Date()) / 1000)))
		update()
		const timer = setInterval(update, 1000)
		return () => clearInterval(timer)
	}, [entry?.status, entry?.offerExpiresAt])

	// ── BUG 1 FIX ────────────────────────────────────────────────────────────────
	// When availableSeats === 0 and user joins waitlist:
	//   1. Create waitlist entry (API call)
	//   2. Show success message: "You have been added to the waitlist."
	//   3. Redirect user to /my-waitlists
	//   NEVER open seat map, NEVER create seat locks, NEVER allow seat selection.
	const join = async () => {
		setLoading(true)
		try {
			await axios.post(`/waitlist/${showtime._id}`, { seatsRequested: joinSeats }, { headers })
			setShowJoinForm(false)
			toast.success('You have been added to the waitlist.', {
				position: 'top-center',
				autoClose: 3000,
				pauseOnHover: false
			})
			// Redirect away from seat map — DO NOT stay here
			navigate('/my-waitlists')
		} catch (err) {
			// Only send the user to login if the server actually rejects the token.
			// Previously a missing in-memory token bounced to /login *before* the
			// request, logging the user out without ever creating the waitlist entry.
			if (err?.response?.status === 401) {
				toast.error('Your session expired. Please log in again.', { position: 'top-center' })
				navigate('/login')
				return
			}
			toast.error(err?.response?.data?.message || 'Unable to join waitlist', { position: 'top-center' })
		} finally {
			setLoading(false)
		}
	}

	const leave = async () => {
		setLoading(true)
		try {
			const response = await axios.delete(`/waitlist/${showtime._id}`, { headers })
			setEntry(null)
			toast.info(response.data.message, { position: 'top-center', autoClose: 2500 })
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Unable to leave waitlist', { position: 'top-center' })
		} finally {
			setLoading(false)
		}
	}

	const accept = async () => {
		setLoading(true)
		try {
			const response = await axios.post(
				`/waitlist/${showtime._id}/accept`,
				{},
				{ headers }
			)

			const seatCount = response.data.data.seatsRequested

			toast.success('Select your preferred seats', {
				position: 'top-center',
				autoClose: 2500
			})

			navigate(`/showtime/${showtime._id}`, {
				state: {
					ticketCount: seatCount,
					isWaitlistBooking: true   // BUG 1 FIX: gates the seat map open
				}
			})
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Unable to accept offer')
			fetchStatus()
		} finally {
			setLoading(false)
		}
	}

	const decline = async () => {
		setLoading(true)
		try {
			const response = await axios.post(`/waitlist/${showtime._id}/decline`, {}, { headers })
			setEntry(null)
			toast.info(response.data.message, { position: 'top-center', autoClose: 2500 })
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Unable to decline offer', { position: 'top-center' })
		} finally {
			setLoading(false)
		}
	}

	if (auth.role === 'admin' || (!isFull && !entry)) return null

	const formatTimer = () =>
		`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`

	return (
		<div className="mt-4 rounded-xl border border-indigo-200 bg-white p-4 shadow">
			<div className="flex items-center gap-2">
				<QueueListIcon className="h-6 w-6 text-indigo-600" />
				<h3 className="font-bold text-indigo-900">Waitlist</h3>
			</div>

			{/* ── OFFERED state ────────────────────────────────────────────────── */}
			{entry?.status === 'OFFERED' ? (
				<div className="mt-3">
					<div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-gray-800">
						<p className="font-semibold text-green-700">Seats are now available for your waitlisted booking!</p>
						<p className="mt-1">
							Only{' '}
							<strong>{entry.offeredSeats?.length}</strong>{' '}
							seat{entry.offeredSeats?.length !== 1 ? 's are' : ' is'} currently available
							for your waitlisted booking of{' '}
							<strong>{entry.seatsRequested}</strong>{' '}
							seat{entry.seatsRequested !== 1 ? 's' : ''}.
						</p>
						{entry.offeredSeats?.length < entry.seatsRequested && (
							<p className="mt-1 text-amber-700 font-medium">
								Would you like to proceed with booking{' '}
								{entry.offeredSeats?.length} seat{entry.offeredSeats?.length !== 1 ? 's' : ''}?
							</p>
						)}
						<p className="mt-1 text-xs text-gray-500">Seats: {entry.offeredSeats?.join(', ')}</p>
					</div>

					<p className="mt-2 flex items-center gap-1 text-sm font-semibold text-red-600">
						<ClockIcon className="h-4 w-4" />
						Complete your booking within {formatTimer()}
					</p>

					<div className="mt-3 flex gap-2">
						<button
							onClick={accept}
							disabled={loading}
							className="flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-60"
						>
							<CheckCircleIcon className="h-4 w-4" />
							Book {entry.offeredSeats?.length} Seat{entry.offeredSeats?.length !== 1 ? 's' : ''}
						</button>
						<button
							onClick={decline}
							disabled={loading}
							className="flex items-center gap-1 rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-60"
						>
							<XCircleIcon className="h-4 w-4" />
							Decline
						</button>
					</div>
				</div>

			/* ── WAITLISTED state ───────────────────────────────────────────────── */
			) : entry?.status === 'WAITLISTED' ? (
				<div className="mt-3">
					<p className="text-sm text-gray-700">
						You are on the waitlist
						{entry.position ? ` at position #${entry.position}` : ''}.
					</p>
					{entry.seatsRequested > 0 && (
						<p className="mt-0.5 text-sm text-gray-500">
							Waiting for {entry.seatsRequested} seat{entry.seatsRequested !== 1 ? 's' : ''}.
						</p>
					)}
					<button
						onClick={leave}
						disabled={loading}
						className="mt-3 rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-60"
					>
						Leave Waitlist
					</button>
				</div>

			/* ── Join state (sold out, not yet on waitlist) ──────────────────────── */
			) : showJoinForm ? (
				<div className="mt-3">
					<p className="text-sm text-gray-700">How many seats do you need?</p>
					<div className="mt-2 flex items-center gap-3">
						<input
							type="number"
							min="1"
							value={joinSeats}
							onChange={(e) => setJoinSeats(Math.max(1, Number(e.target.value) || 1))}
							className="w-20 rounded-md border border-indigo-200 px-2 py-1 text-center font-bold text-indigo-900"
						/>
						<button
							onClick={join}
							disabled={loading}
							className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
						>
							{loading ? 'Joining...' : 'Confirm'}
						</button>
						<button
							onClick={() => setShowJoinForm(false)}
							disabled={loading}
							className="rounded-lg bg-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300"
						>
							Cancel
						</button>
					</div>
				</div>
			) : (
				<div className="mt-3">
					<p className="text-sm text-gray-700">
						This show is sold out. Join the waitlist and we will notify you when seats open up.
					</p>
					<button
						onClick={() => setShowJoinForm(true)}
						disabled={loading}
						className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
					>
						Join Waitlist
					</button>
				</div>
			)}
		</div>
	)
}

export default WaitlistPanel