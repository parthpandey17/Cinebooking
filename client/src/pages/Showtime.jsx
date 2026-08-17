import { TicketIcon } from '@heroicons/react/24/solid'
import { ExclamationTriangleIcon, LockClosedIcon, QueueListIcon } from '@heroicons/react/24/outline'
import axios from '../config/axiosConfig'
import { Fragment, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Select from 'react-tailwindcss-select'
import { toast } from 'react-toastify'
import Loading from '../components/Loading'
import Navbar from '../components/Navbar'
import Seat from '../components/Seat'
import ShowtimeDetails from '../components/ShowtimeDetails'
import WaitlistPanel from '../components/WaitlistPanel'
import { AuthContext } from '../context/AuthContext'

// ─── Race Condition Dialog ────────────────────────────────────────────────────
const RaceConditionDialog = ({ unavailableCount, totalRequested, availableNow, onJoinWaitlist, onReturn }) => (
	<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
		<div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
			<div className="flex items-center gap-2">
				<ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
				<h3 className="text-lg font-bold text-amber-700">Seats No Longer Available</h3>
			</div>
			<p className="mt-3 text-sm text-gray-700">
				Some of your selected seats are no longer available because another customer is currently booking them.
			</p>
			<div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
				<div className="flex justify-between">
					<span className="text-gray-600">Seats you selected:</span>
					<span className="font-semibold">{totalRequested}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-gray-600">Still available now:</span>
					<span className="font-semibold text-green-700">{availableNow}</span>
				</div>
				<div className="flex justify-between">
					<span className="text-gray-600">Unavailable:</span>
					<span className="font-semibold text-red-600">{unavailableCount}</span>
				</div>
			</div>
			<div className="mt-5 flex flex-col gap-2">
				<button
					onClick={onJoinWaitlist}
					className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
				>
					<QueueListIcon className="h-4 w-4" />
					Join Waitlist for {unavailableCount} Unavailable Seat{unavailableCount !== 1 ? 's' : ''}
				</button>
				<button
					onClick={onReturn}
					className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
				>
					Choose Different Seats
				</button>
			</div>
		</div>
	</div>
)

// ─── All-Seats-Gone Dialog ─────────────────────────────────────────────────────
const AllSeatsGoneDialog = ({ onJoinWaitlist, onBack }) => (
	<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
		<div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
			<div className="flex items-center gap-2">
				<ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
				<h3 className="text-lg font-bold text-red-700">No Seats Currently Available</h3>
			</div>
			<p className="mt-3 text-sm text-gray-700">
				All remaining seats are currently being held by another customer. You can join the waitlist
				and we'll notify you if a seat becomes available.
			</p>
			<div className="mt-5 flex flex-col gap-2">
				<button
					onClick={onJoinWaitlist}
					className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
				>
					<QueueListIcon className="h-4 w-4" />
					Join Waitlist
				</button>
				<button
					onClick={onBack}
					className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
				>
					Back to Showtimes
				</button>
			</div>
		</div>
	</div>
)

// ─── Waitlist Offer Dialog ─────────────────────────────────────────────────────
const WaitlistOfferDialog = ({ entry, onAccept, onDecline }) => {
	const [secs, setSecs] = useState(() =>
		entry?.offerExpiresAt
			? Math.max(0, Math.floor((new Date(entry.offerExpiresAt).getTime() - Date.now()) / 1000))
			: 0
	)
	const ref = useRef(null)
	useEffect(() => {
		ref.current = setInterval(() => {
			setSecs((prev) => {
				if (prev <= 1) { clearInterval(ref.current); return 0 }
				return prev - 1
			})
		}, 1000)
		return () => clearInterval(ref.current)
	}, [])
	const m = Math.floor(secs / 60), s = secs % 60

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
			<div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
				<div className="flex items-center gap-2">
					<QueueListIcon className="h-6 w-6 text-green-600" />
					<h3 className="text-lg font-bold text-green-700">Seats Available For Your Waitlist!</h3>
				</div>
				<p className="mt-3 text-sm text-gray-700">
					A seat has become available and has been reserved for you from the waitlist.
				</p>
				<div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm">
					<div className="flex justify-between">
						<span className="text-gray-600">Offer expires in:</span>
						<span className={`font-bold tabular-nums ${secs <= 60 ? 'animate-pulse text-red-600' : 'text-amber-700'}`}>
							{m}:{String(s).padStart(2, '0')}
						</span>
					</div>
				</div>
				<div className="mt-5 flex flex-col gap-2">
					<button
						onClick={onAccept}
						className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500"
					>
						<TicketIcon className="h-4 w-4" />
						Accept Offer — Select Seats
					</button>
					<button
						onClick={onDecline}
						className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
					>
						Decline Offer
					</button>
				</div>
			</div>
		</div>
	)
}

// ─── Partial-Booking Dialog (BUG 1) ────────────────────────────────────────────
// Shown when the user requested more seats than are currently available.
// Presents exactly the three options required by the workflow.
const PartialBookingDialog = ({ available, remaining, onBookAndStay, onBookAndLeave, onCancelAll, busy }) => (
	<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
		<div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
			<div className="flex items-center gap-2">
				<ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
				<h3 className="text-lg font-bold text-amber-700">
					Only {available} seat{available !== 1 ? 's are' : ' is'} available
				</h3>
			</div>
			<p className="mt-3 text-sm text-gray-700">
				You're about to book the <strong>{available}</strong> available seat{available !== 1 ? 's' : ''}.
				You still need <strong>{remaining}</strong> more. What would you like to do?
			</p>

			<div className="mt-5 flex flex-col gap-2">
				<button
					onClick={onBookAndStay}
					disabled={busy}
					className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
				>
					<QueueListIcon className="h-4 w-4" />
					Book {available} now &amp; stay in waitlist for {remaining} more
				</button>
				<button
					onClick={onBookAndLeave}
					disabled={busy}
					className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-60"
				>
					<TicketIcon className="h-4 w-4" />
					Book {available} only &amp; cancel the rest
				</button>
				<button
					onClick={onCancelAll}
					disabled={busy}
					className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60"
				>
					Cancel everything — return to movies
				</button>
			</div>
		</div>
	</div>
)

// ─── Waitlist Auto-Join Banner ─────────────────────────────────────────────────
const WaitlistAutoBanner = ({ seats, showtime, auth, onDismiss }) => {
	const [joined, setJoined] = useState(false)
	const [loading, setLoading] = useState(false)

	const join = async () => {
		setLoading(true)
		try {
			await axios.post(
				`/waitlist/${showtime._id}`,
				{ seatsRequested: seats },
				{ headers: { Authorization: `Bearer ${auth.token}` } }
			)
			setJoined(true)
			toast.success(`Joined waitlist for ${seats} seat${seats !== 1 ? 's' : ''}`, { position: 'top-center', autoClose: 3000 })
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Could not join waitlist', { position: 'top-center' })
		} finally {
			setLoading(false)
		}
	}

	if (joined) {
		return (
			<div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
				<p className="flex items-center gap-2 text-sm font-semibold text-green-700">
					<QueueListIcon className="h-5 w-5" />
					You are on the waitlist for {seats} additional seat{seats !== 1 ? 's' : ''}. We'll notify you when they become available.
				</p>
				<button onClick={onDismiss} className="mt-2 text-xs text-gray-500 hover:underline">Dismiss</button>
			</div>
		)
	}

	return (
		<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
			<p className="text-sm font-semibold text-amber-800">
				You're booking {showtime.availableSeats} available seat{showtime.availableSeats !== 1 ? 's' : ''}.
				Would you also like to join the waitlist for the remaining {seats} seat{seats !== 1 ? 's' : ''}?
			</p>
			<div className="mt-3 flex gap-2">
				<button
					onClick={join}
					disabled={loading}
					className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
				>
					<QueueListIcon className="h-4 w-4" />
					{loading ? 'Joining...' : `Yes, join waitlist for ${seats} seat${seats !== 1 ? 's' : ''}`}
				</button>
				<button
					onClick={onDismiss}
					className="rounded-lg bg-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-300"
				>
					No thanks
				</button>
			</div>
		</div>
	)
}

// ─── Main Showtime Page ────────────────────────────────────────────────────────
const Showtime = () => {
	const { auth } = useContext(AuthContext)
	const { id } = useParams()
	const navigate = useNavigate()
	const location = useLocation()

	const [showtime, setShowtime]           = useState({})
	const [selectedSeats, setSelectedSeats] = useState([])

	const ticketCount       = Math.max(1, Number(location.state?.ticketCount || 1))
	const waitlistSeats     = location.state?.waitlistSeats || 0
	// BUG 1 FIX: Only allow seat selection when user came from an accepted waitlist offer.
	// This flag is set by WaitlistPanel / MyWaitlists accept handlers via navigate state.
	const isWaitlistBooking = location.state?.isWaitlistBooking === true

	const [filterRow, setFilterRow]       = useState(null)
	const [filterColumn, setFilterColumn] = useState(null)

	const [lockedSeats, setLockedSeats]   = useState([])
	const [availability, setAvailability] = useState(null)
	const [isLocking, setIsLocking]       = useState(false)

	// Dialogs
	const [raceDialog, setRaceDialog]               = useState(null)
	const [allSeatsGoneDialog, setAllSeatsGoneDialog] = useState(false)
	const [offerDialog, setOfferDialog]             = useState(null)
	// BUG 1: partial-availability 3-option dialog
	const [partialDialog, setPartialDialog]         = useState(null)

	// Waitlist banner for partial bookings
	const [showWaitlistBanner, setShowWaitlistBanner] = useState(waitlistSeats > 0)

	const lastWaitlistStatus = useRef(null)
	const lastAvailableSeats = useRef(null)
	const allSeatsGoneShown  = useRef(false)
	const lockPollRef        = useRef(null)
	// One-time guard: auto-select a waitlist acceptee's reserved (held-for-them) seats.
	const didPreselectRef    = useRef(false)

	// ── BUG 2 FIX: dynamic required seat count ────────────────────────────────
	// The selection limit, the seat counter and the Purchase button must track
	// LIVE availability, not the ticketCount cached in navigation state. When a
	// race drops availability from 3 → 2, requiredCount becomes 2 everywhere.
	// A waitlist acceptee's seats are already held for them, so they select
	// exactly their accepted count regardless of public availability.
	const availableNow = Math.max(
		0,
		Number(availability?.availableSeats ?? showtime?.availableSeats ?? 0)
	)
	const requiredCount = isWaitlistBooking ? ticketCount : Math.min(ticketCount, availableNow)
	const shortfall     = isWaitlistBooking ? 0 : Math.max(0, ticketCount - requiredCount)

	const sortedSelectedSeat = [...selectedSeats].sort((a, b) => {
		const [rowA, numberA] = a.match(/([A-Za-z]+)(\d+)/).slice(1)
		const [rowB, numberB] = b.match(/([A-Za-z]+)(\d+)/).slice(1)
		if (rowA === rowB) return parseInt(numberA) > parseInt(numberB) ? 1 : -1
		if (rowA.length !== rowB.length) return rowA.length > rowB.length ? 1 : -1
		return rowA > rowB ? 1 : -1
	})

	const fetchShowtime = async () => {
		try {
			let response
			if (auth.role === 'admin') {
				response = await axios.get(`/showtime/user/${id}`, { headers: { Authorization: `Bearer ${auth.token}` } })
			} else {
				response = await axios.get(`/showtime/${id}`)
			}
			setShowtime(response.data.data)
		} catch (error) {
			console.error(error)
			toast.error(error?.response?.data?.message || 'Error', { position: 'top-center', autoClose: 2000, pauseOnHover: false })
		}
	}

	const fetchLiveState = useCallback(async () => {
		try {
			const requests = [
				axios.get(`/seatlock/${id}`),
				axios.get(`/showtime/${id}/availability`),
			]

			if (auth.token && auth.role === 'user') {
				requests.push(
					axios.get(`/waitlist/${id}`, { headers: { Authorization: `Bearer ${auth.token}` } })
						.catch(() => null)
				)
			}

			const results = await Promise.all(requests)
			const [locksRes, availRes, waitlistRes] = results

			const locks         = locksRes.data.data || []
			const availData     = availRes.data.data
			const available     = Number(availData?.availableSeats ?? 0)
			const waitlistEntry = waitlistRes?.data?.data || null

			setLockedSeats(locks)
			setAvailability(availData)
			setShowtime((current) => ({ ...current, ...availData }))

			const prevAvailable = lastAvailableSeats.current
			lastAvailableSeats.current = available

			if (
				available === 0 &&
				prevAvailable !== null &&
				prevAvailable > 0 &&
				!allSeatsGoneShown.current &&
				!raceDialog &&
				!offerDialog &&
				auth.role === 'user' &&
				!['WAITLISTED', 'OFFERED'].includes(waitlistEntry?.status)
			) {
				allSeatsGoneShown.current = true
				setSelectedSeats([])
				setAllSeatsGoneDialog(true)
			}

			if (auth.role === 'user' && waitlistEntry) {
				const prevStatus = lastWaitlistStatus.current
				lastWaitlistStatus.current = waitlistEntry.status

				if (prevStatus === 'WAITLISTED' && waitlistEntry.status === 'OFFERED' && !offerDialog) {
					setOfferDialog({
						...waitlistEntry,
						offerSecondsLeft: Math.max(
							0,
							Math.floor((new Date(waitlistEntry.offerExpiresAt).getTime() - Date.now()) / 1000)
						)
					})
				}

				if (prevStatus === null && waitlistEntry.status === 'OFFERED' && !offerDialog) {
					setOfferDialog({
						...waitlistEntry,
						offerSecondsLeft: Math.max(
							0,
							Math.floor((new Date(waitlistEntry.offerExpiresAt).getTime() - Date.now()) / 1000)
						)
					})
				}
			}
		} catch (error) {
			console.error('Failed to fetch live state:', error)
		}
	}, [id, auth.token, auth.role, raceDialog, offerDialog])

	useEffect(() => {
		fetchShowtime()
		fetchLiveState()
		lockPollRef.current = setInterval(fetchLiveState, 5000)
		return () => clearInterval(lockPollRef.current)
	}, [])

	// ── Waitlist acceptee: bind to the seat(s) reserved for them ──────────────
	// When a user accepts a waitlist offer they are sent here to "select seats".
	// The offered seats are already locked FOR them, so we pre-select those exact
	// seats (rendered as the blue "Held for you" tiles). This removes the stranded
	// "held but unused" seat (the seat the offer reserved no longer sits idle while
	// the user picks a different one), and it is race-free because the seat is
	// already held under this user's lock — no one else can take it between
	// selection and payment. The user may still deselect and pick a different
	// available seat; the unused hold is released by the lock reconciliation on
	// Purchase. Runs once, after locks have loaded.
	useEffect(() => {
		if (didPreselectRef.current) return
		if (!isWaitlistBooking || !auth.id) return
		const myHeldSeats = lockedSeats
			.filter((l) => String(l.userId) === String(auth.id))
			.map((l) => l.seatNumber)
		if (myHeldSeats.length === 0) return
		didPreselectRef.current = true
		setSelectedSeats((prev) => {
			const merged = [...new Set([...prev, ...myHeldSeats])]
			return merged.slice(0, requiredCount)
		})
	}, [isWaitlistBooking, auth.id, lockedSeats, requiredCount])

	// Locks the currently-selected seats and moves to the payment page.
	// `waitlistRemainder` (> 0) tells Purchase.jsx to auto-join the waitlist for
	// the outstanding seats after a successful payment (BUG 1, Option 1).
	const proceedToBook = async (waitlistRemainder = 0) => {
		setPartialDialog(null)
		setIsLocking(true)
		try {
			await axios.post(
				'/seatlock/lock',
				{ showtimeId: id, seats: sortedSelectedSeat },
				{ headers: { Authorization: `Bearer ${auth.token}` } }
			)
			navigate(`/purchase/${id}`, {
				state: {
					selectedSeats: sortedSelectedSeat,
					showtime,
					ticketCount: sortedSelectedSeat.length,
					waitlistRemainder,
					originalRequested: ticketCount
				}
			})
		} catch (error) {
			const msg = error?.response?.data?.message || 'Could not lock seats. Please try again.'
			toast.error(msg, { position: 'top-center', autoClose: 3000, pauseOnHover: false })
			fetchLiveState()
		} finally {
			setIsLocking(false)
		}
	}

	const handlePurchaseClick = async () => {
		if (auth.role === 'admin') {
			toast.error('Administrators cannot purchase tickets', { position: 'top-center', autoClose: 2000 })
			return
		}
		if (!auth.role) { navigate('/login'); return }
		if (sortedSelectedSeat.length === 0) return

		setIsLocking(true)
		try {
			const validationRes = await axios.post(
				'/seatlock/validate',
				{ showtimeId: id, seats: sortedSelectedSeat },
				{ headers: { Authorization: `Bearer ${auth.token}` } }
			)

			const { availableSeats: stillAvailable, unavailableSeats } = validationRes.data.data

			if (unavailableSeats && unavailableSeats.length > 0) {
				setSelectedSeats((prev) => prev.filter((s) => !unavailableSeats.includes(s)))
				await fetchLiveState()

				if (stillAvailable === 0) {
					setAllSeatsGoneDialog(true)
				} else {
					setRaceDialog({
						unavailable: unavailableSeats.length,
						availableNow: stillAvailable
					})
				}
				setIsLocking(false)
				return
			}

			// BUG 1: user requested more than is available. Offer the 3 choices
			// instead of blocking or forcing them to pick the full count.
			if (shortfall > 0 && !isWaitlistBooking) {
				setIsLocking(false)
				setPartialDialog({ available: sortedSelectedSeat.length, remaining: shortfall })
				return
			}

			// Normal full-availability path (or waitlist acceptee): book directly.
			setIsLocking(false)
			await proceedToBook(0)
		} catch (error) {
			const msg = error?.response?.data?.message || 'Could not lock seats. Please try again.'
			toast.error(msg, { position: 'top-center', autoClose: 3000, pauseOnHover: false })
			fetchLiveState()
			setIsLocking(false)
		}
	}

	const handleOfferAccept = async () => {
		if (!offerDialog) return
		try {
			await axios.post(`/waitlist/${id}/accept`, {}, { headers: { Authorization: `Bearer ${auth.token}` } })
			setOfferDialog(null)
			toast.success('Offer accepted! Select your seats below.', { position: 'top-center', autoClose: 2500 })
			await fetchLiveState()
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Could not accept offer', { position: 'top-center' })
			setOfferDialog(null)
			await fetchLiveState()
		}
	}

	const handleOfferDecline = async () => {
		if (!offerDialog) return
		try {
			await axios.post(`/waitlist/${id}/decline`, {}, { headers: { Authorization: `Bearer ${auth.token}` } })
			setOfferDialog(null)
			toast.info('Offer declined.', { position: 'top-center', autoClose: 2000 })
			navigate('/cinema')
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Could not decline offer', { position: 'top-center' })
			setOfferDialog(null)
		}
	}

	const handleJoinWaitlistFromGoneDialog = async () => {
		setAllSeatsGoneDialog(false)
		try {
			await axios.post(
				`/waitlist/${id}`,
				{ seatsRequested: ticketCount }
			)
			toast.success(`Joined waitlist for ${ticketCount} seat${ticketCount !== 1 ? 's' : ''}`, { position: 'top-center' })
			navigate('/my-waitlists')
		} catch (err) {
			if (err?.response?.status === 401) {
				toast.error('Your session expired. Please log in again.', { position: 'top-center' })
				navigate('/login')
				return
			}
			toast.error(err?.response?.data?.message || 'Could not join waitlist', { position: 'top-center' })
		}
	}

	const handleJoinWaitlistFromRaceDialog = async () => {
		const count = raceDialog?.unavailable || 1
		setRaceDialog(null)
		try {
			await axios.post(
				`/waitlist/${id}`,
				{ seatsRequested: count }
			)
			toast.success(`Joined waitlist for ${count} seat${count !== 1 ? 's' : ''}`, { position: 'top-center' })
			navigate('/my-waitlists')
		} catch (err) {
			if (err?.response?.status === 401) {
				toast.error('Your session expired. Please log in again.', { position: 'top-center' })
				navigate('/login')
				return
			}
			toast.error(err?.response?.data?.message || 'Could not join waitlist', { position: 'top-center' })
			navigate(`/showtime/${id}`)
		}
	}

	// ── Seat map geometry ──────────────────────────────────────────────────────
	const row = showtime?.theater?.seatPlan?.row
	let rowLetters = []
	if (row) {
		for (let k = 64; k <= (row.length === 2 ? row.charCodeAt(0) : 64); k++) {
			for (let i = 65; i <= (k === row.charCodeAt(0) || row.length === 1 ? row.charCodeAt(row.length - 1) : 90); i++) {
				const letter = k === 64 ? String.fromCharCode(i) : String.fromCharCode(k) + String.fromCharCode(i)
				rowLetters.push(letter)
			}
		}
	}

	const column = showtime?.theater?.seatPlan?.column
	let colNumber = []
	for (let k = 1; k <= column; k++) colNumber.push(k)

	const isPast = new Date(showtime.showtime) < new Date()
	const isFull = Number(availability?.availableSeats ?? showtime?.availableSeats ?? 1) <= 0

	const filteredSeats = showtime?.seats?.filter((seat) => {
		return (
			(!filterRow    || filterRow.map((r) => r.value).includes(seat.row)) &&
			(!filterColumn || filterColumn.map((c) => c.value).includes(String(seat.number)))
		)
	})

	const lockedSeatMap = {}
	lockedSeats.forEach((lock) => { lockedSeatMap[lock.seatNumber] = lock })

	const getSeatStatus = (rowLetter, col) => {
		const seatLabel = `${rowLetter}${col}`
		const lock = lockedSeatMap[seatLabel]
		if (!lock) return 'available'
		if (auth.id && String(lock.userId) === String(auth.id)) return 'myLock'
		return 'locked'
	}

	return (
		<div className="flex min-h-screen flex-col gap-4 bg-gradient-to-br from-indigo-900 to-blue-500 pb-8 sm:gap-8">
			<Navbar />
			<div className="mx-4 h-fit rounded-lg bg-gradient-to-br from-indigo-200 to-blue-100 p-4 drop-shadow-xl sm:mx-8 sm:p-6">
				{showtime.showtime ? (
					<>
						<ShowtimeDetails showtime={showtime} showDeleteBtn={true} fetchShowtime={fetchShowtime} />

						{/* Waitlist offer dialog */}
						{offerDialog && (
							<WaitlistOfferDialog
								entry={offerDialog}
								onAccept={handleOfferAccept}
								onDecline={handleOfferDecline}
							/>
						)}

						{/* All-seats-gone dialog */}
						{allSeatsGoneDialog && (
							<AllSeatsGoneDialog
								onJoinWaitlist={handleJoinWaitlistFromGoneDialog}
								onBack={() => navigate('/cinema')}
							/>
						)}

						{/* Race-condition dialog */}
						{raceDialog && (
							<RaceConditionDialog
								unavailableCount={raceDialog.unavailable}
								totalRequested={sortedSelectedSeat.length + raceDialog.unavailable}
								availableNow={raceDialog.availableNow}
								onJoinWaitlist={handleJoinWaitlistFromRaceDialog}
								onReturn={() => { setRaceDialog(null); fetchLiveState() }}
							/>
						)}

						{/* BUG 1: partial-availability 3-option dialog */}
						{partialDialog && (
							<PartialBookingDialog
								available={partialDialog.available}
								remaining={partialDialog.remaining}
								busy={isLocking}
								onBookAndStay={() => proceedToBook(partialDialog.remaining)}
								onBookAndLeave={() => proceedToBook(0)}
								onCancelAll={() => { setPartialDialog(null); setSelectedSeats([]); navigate('/cinema') }}
							/>
						)}

						{/* BUG 2: live shortfall banner — reflects current availability */}
						{!isWaitlistBooking && !isPast && !isFull && shortfall > 0 && auth.role === 'user' && (
							<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
								<p className="text-sm font-semibold text-amber-800">
									Only {availableNow} of your {ticketCount} requested seat{ticketCount !== 1 ? 's' : ''} {availableNow === 1 ? 'is' : 'are'} available right now.
								</p>
								<p className="mt-1 text-sm text-amber-700">
									Select {requiredCount} seat{requiredCount !== 1 ? 's' : ''} and tap Purchase — you can then book {requiredCount} now and waitlist for the remaining {shortfall}.
								</p>
							</div>
						)}

						{/* Partial booking waitlist banner */}
						{showWaitlistBanner && waitlistSeats > 0 && !isPast && showtime._id && (
							<WaitlistAutoBanner
								seats={waitlistSeats}
								showtime={showtime}
								auth={auth}
								onDismiss={() => setShowWaitlistBanner(false)}
							/>
						)}

						{/* ── BUG 1 FIX: Sold-out gate ──────────────────────────────────────────
						    When availableSeats === 0 and user did NOT come via an accepted waitlist
						    offer, block the seat map. Show WaitlistPanel to join only.
						    Seat map is only shown when seats are available OR isWaitlistBooking=true */}
						{isFull && !isWaitlistBooking && auth.role === 'user' && !isPast ? (
							<div className="mt-4">
								<div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-4 text-center">
									<p className="text-lg font-bold text-red-700">This show is sold out</p>
									<p className="mt-1 text-sm text-gray-600">
										No seats are currently available. Join the waitlist and we'll
										notify you instantly when a seat opens up.
									</p>
								</div>
								<WaitlistPanel
									auth={auth}
									isFull={isFull}
									showtime={showtime}
								/>
							</div>
						) : (
							<>
								{/* Selected seats bar + Purchase button */}
								<div className="flex flex-col justify-between rounded-b-lg bg-gradient-to-br from-indigo-100 to-white text-center text-lg drop-shadow-lg md:flex-row">
									<div className="flex flex-col items-center gap-x-4 px-4 py-2 md:flex-row">
										{auth.role !== 'admin' && !isPast && <p className="font-semibold">Selected Seats : </p>}
										<p className="text-start">{sortedSelectedSeat.join(', ')}</p>
										{!!selectedSeats.length && (
											<p className="whitespace-nowrap">({selectedSeats.length} seats)</p>
										)}
									</div>
									{auth.role !== 'admin' && !!selectedSeats.length && !isPast && (
										<button
											onClick={handlePurchaseClick}
											disabled={isLocking || requiredCount === 0 || selectedSeats.length !== requiredCount}
											className="flex items-center justify-center gap-2 rounded-b-lg bg-gradient-to-br from-indigo-600 to-blue-500 px-4 py-1 font-semibold text-white hover:from-indigo-500 hover:to-blue-500 disabled:from-slate-500 disabled:to-slate-400 md:rounded-none md:rounded-br-lg"
										>
											{isLocking ? (
												'Reserving...'
											) : selectedSeats.length !== requiredCount ? (
												`Select ${Math.max(0, requiredCount - selectedSeats.length)} more`
											) : (
												<>
													<p>Purchase</p>
													<TicketIcon className="h-7 w-7 text-white" />
												</>
											)}
										</button>
									)}
								</div>

								{/* Seat Map */}
								<div className="mx-auto mt-4 flex flex-col items-center rounded-lg bg-gradient-to-br from-indigo-100 to-white p-4 text-center drop-shadow-lg">
									<div className="w-full rounded-lg bg-white">
										<div className="bg-gradient-to-r from-indigo-800 to-blue-700 bg-clip-text text-xl font-bold text-transparent">
											Screen
										</div>
									</div>

									<div className="flex w-full flex-col overflow-x-auto overflow-y-hidden">
										<div className="m-auto my-2">
											<div className="flex flex-col">
												<div className="flex items-center">
													<div className="flex h-8 w-8 items-center"><p className="w-8"></p></div>
													{colNumber.map((col, index) => (
														<div key={index} className="flex h-8 w-8 items-center">
															<p className="w-8 font-semibold">{col}</p>
														</div>
													))}
												</div>
												{rowLetters.reverse().map((rowLetter, index) => (
													<div key={index} className="flex">
														<div className="flex h-8 w-8 items-center">
															<p className="w-8 text-xl font-semibold">{rowLetter}</p>
														</div>
														{colNumber.map((col, index) => {
															const isBooked = showtime.seats.some((seat) => seat.row === rowLetter && seat.number === col)
															const status   = isBooked ? 'booked' : getSeatStatus(rowLetter, col)
															return (
																<Seat
																	key={index}
																	seat={{ row: rowLetter, number: col }}
																	setSelectedSeats={setSelectedSeats}
										isSelected={selectedSeats.includes(`${rowLetter}${col}`)}
																	selectable={
																		auth.role !== 'admin' &&
																		!isPast &&
																		status !== 'locked' &&
																		selectedSeats.length < requiredCount
																	}
																	isAvailable={!isBooked}
																	seatStatus={status}
																/>
															)
														})}
														<div className="flex h-8 w-8 items-center">
															<p className="w-8 text-xl font-semibold">{rowLetter}</p>
														</div>
													</div>
												))}
											</div>
										</div>
									</div>

									{/* Seat Legend */}
									<div className="mt-3 flex flex-wrap justify-center gap-4 text-sm font-medium text-gray-700">
										<div className="flex items-center gap-1.5">
											<div className="h-5 w-5 rounded bg-white drop-shadow-md border border-gray-200"></div>
											<span>Available</span>
										</div>
										<div className="flex items-center gap-1.5">
											<div className="flex h-5 w-5 items-center justify-center rounded bg-blue-500">
												<span className="text-white text-xs">✓</span>
											</div>
											<span>Selected</span>
										</div>
										<div className="flex items-center gap-1.5">
											<div className="flex h-5 w-5 items-center justify-center rounded bg-amber-400">
												<LockClosedIcon className="h-3 w-3 text-amber-900" />
											</div>
											<span>Held (5 min)</span>
										</div>
										<div className="flex items-center gap-1.5">
											<div className="h-5 w-5 rounded bg-gray-500"></div>
											<span>Booked</span>
										</div>
									</div>
									<p className="mt-2 text-xs text-gray-400">Seat map updates automatically every 5 seconds</p>
								</div>

								{/* Admin booked seats table */}
								{auth.role === 'admin' && (
									<>
										<h2 className="mt-4 text-2xl font-bold">Booked Seats</h2>
										<div className="mt-2 flex gap-2 rounded-md bg-gradient-to-br from-indigo-100 to-white p-4">
											<div className="flex grow flex-col">
												<h4 className="text-lg font-bold text-gray-800">Row</h4>
												<Select
													value={filterRow}
													options={Array.from(new Set(showtime?.seats.map((seat) => seat.row)))
														.sort((a, b) => { if (a === b) return 0; if (a.length !== b.length) return a.length > b.length ? 1 : -1; return a > b ? 1 : -1 })
														.map((value) => ({ value, label: value }))}
													onChange={(value) => setFilterRow(value)}
													isClearable={true} isMultiple={true} isSearchable={true} primaryColor="indigo"
												/>
											</div>
											<div className="flex grow flex-col">
												<h4 className="text-lg font-bold text-gray-800">Number</h4>
												<Select
													value={filterColumn}
													options={Array.from(new Set(showtime?.seats.map((seat) => seat.number)))
														.sort((a, b) => a - b)
														.map((value) => ({ value: String(value), label: String(value) }))}
													onChange={(value) => setFilterColumn(value)}
													isClearable={true} isMultiple={true} isSearchable={true} primaryColor="indigo"
												/>
											</div>
										</div>
										<div
											className="mt-4 grid max-h-screen w-full overflow-auto rounded-md bg-gradient-to-br from-indigo-100 to-white"
											style={{ gridTemplateColumns: 'repeat(4, minmax(max-content, 1fr))' }}
										>
											{['Seat', 'Username', 'Email', 'Role'].map((h) => (
												<p key={h} className="sticky top-0 bg-gradient-to-br from-gray-800 to-gray-700 px-2 py-1 text-center text-xl font-semibold text-white">{h}</p>
											))}
											{filteredSeats
												?.sort((a, b) => {
													if (a.row === b.row) return a.number > b.number ? 1 : -1
													if (a.row.length !== b.row.length) return a.row.length > b.row.length ? 1 : -1
													return a.row > b.row ? 1 : -1
												})
												.map((seat, index) => (
													<Fragment key={index}>
														<div className="border-t-2 border-indigo-200 px-2 py-1">{`${seat.row}${seat.number}`}</div>
														<div className="border-t-2 border-indigo-200 px-2 py-1">{seat.user.username}</div>
														<div className="border-t-2 border-indigo-200 px-2 py-1">{seat.user.email}</div>
														<div className="border-t-2 border-indigo-200 px-2 py-1">{seat.user.role}</div>
													</Fragment>
												))}
										</div>
									</>
								)}
							</>
						)}
					</>
				) : (
					<Loading />
				)}
			</div>
		</div>
	)
}

export default Showtime