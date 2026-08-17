import {
	ArrowPathIcon,
	CheckCircleIcon,
	ClockIcon,
	ExclamationTriangleIcon,
	MinusIcon,
	PlusIcon,
	QueueListIcon,
	TicketIcon,
	XCircleIcon,
	XMarkIcon
} from '@heroicons/react/24/outline'
import axios from '../config/axiosConfig'
import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { io as socketIO } from 'socket.io-client'
import Navbar from '../components/Navbar'
import { AuthContext } from '../context/AuthContext'
import { apiBaseUrl } from '../config/apiBaseUrl'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d) =>
	d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

const fmtTime = (secs) => {
	const m = Math.floor(secs / 60)
	const s = secs % 60
	return `${m}:${String(s).padStart(2, '0')}`
}

// seatsRemaining is now stored on the entry. Fall back gracefully for legacy rows.
const getSeatsRemaining = (entry) => {
	if (entry.seatsRemaining != null) return entry.seatsRemaining
	return entry.seatsRequested - (entry.seatsAccepted || 0)
}

// ─── Status Badge ──────────────────────────────────────────────────────────────

const StatusBadge = ({ status }) => {
	const map = {
		WAITLISTED:    { cls: 'bg-blue-100 text-blue-700',     label: 'Waitlisted' },
		OFFERED:       { cls: 'bg-amber-100 text-amber-800',   label: 'Offer Available' },
		OFFER_PARTIAL: { cls: 'bg-orange-100 text-orange-800', label: 'Partial Offer' },
		ACCEPTED:      { cls: 'bg-green-100 text-green-700',   label: 'Accepted' },
		CONFIRMED:     { cls: 'bg-green-100 text-green-700',   label: 'Confirmed' },
		EXPIRED:       { cls: 'bg-red-100 text-red-600',       label: 'Expired' },
		REJECTED:      { cls: 'bg-gray-200 text-gray-600',     label: 'Declined' },
		CANCELLED:     { cls: 'bg-gray-200 text-gray-500',     label: 'Cancelled' }
	}
	const { cls, label } = map[status] || { cls: 'bg-gray-100 text-gray-500', label: status }
	return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
}

// ─── Offer Countdown ───────────────────────────────────────────────────────────

const OfferCountdown = ({ offerExpiresAt, onExpired }) => {
	const calcLeft = () =>
		offerExpiresAt
			? Math.max(0, Math.floor((new Date(offerExpiresAt).getTime() - Date.now()) / 1000))
			: 0

	const [secs, setSecs] = useState(calcLeft)
	const ref = useRef(null)

	useEffect(() => {
		setSecs(calcLeft())
		ref.current = setInterval(() => {
			const remaining = calcLeft()
			setSecs(remaining)
			if (remaining <= 0) {
				clearInterval(ref.current)
				onExpired?.()
			}
		}, 1000)
		return () => clearInterval(ref.current)
	}, [offerExpiresAt])

	const urgent = secs <= 60
	return (
		<span className={`text-lg font-bold tabular-nums ${urgent ? 'animate-pulse text-red-600' : 'text-amber-700'}`}>
			{fmtTime(secs)}
		</span>
	)
}

// ─── Three-Option Partial Offer Dialog ────────────────────────────────────────
//
// Presents the user with three explicit choices when a partial offer arrives:
//   Option 1 — Book available seats AND remain in waitlist for the rest
//   Option 2 — Book available seats and leave the waitlist (done)
//   Option 3 — Decline the offer entirely (removed from queue)
//
// The old "Wait for all N seats" option was removed: skipping a partial offer
// while holding the offered seats blocks users who only need fewer seats.
//
// CSS: the modal is a flex column capped at max-h-[90vh]; header / stats / footer
// stay fixed while the OPTIONS area scrolls, so nothing clips on short screens.

const PartialOfferDialog = ({ entry, isOpen, onChoose, onClose, isProcessing }) => {
	const seatsOffered    = entry?.offeredSeats?.length || 0
	const seatsRequested  = entry?.seatsRequested || 0
	const seatsRemaining  = entry ? getSeatsRemaining(entry) : 0
	const [acceptCount, setAcceptCount] = useState(seatsOffered)

	// Reset counter when entry changes
	useEffect(() => {
		setAcceptCount(seatsOffered)
	}, [seatsOffered, isOpen])

	if (!isOpen || !entry) return null

	const remainingAfterAccept = seatsRemaining - acceptCount

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
			<div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

				{/* Header (fixed) */}
				<div className="shrink-0 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-amber-50 px-6 py-4">
					<h2 className="text-lg font-bold text-gray-800">Partial Seat Offer</h2>
					<p className="mt-1 text-sm text-gray-600">
						You need <strong>{seatsRemaining}</strong> more seat{seatsRemaining !== 1 ? 's' : ''}, but only{' '}
						<strong>{seatsOffered}</strong> {seatsOffered !== 1 ? 'are' : 'is'} available right now.
					</p>
				</div>

				{/* Stats row (fixed) */}
				<div className="shrink-0 grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 bg-gray-50 px-6 py-3 text-center text-sm">
					<div>
						<p className="text-xs text-gray-500">Originally requested</p>
						<p className="font-bold text-gray-800">{seatsRequested}</p>
					</div>
					<div>
						<p className="text-xs text-gray-500">Still needed</p>
						<p className="font-bold text-indigo-700">{seatsRemaining}</p>
					</div>
					<div>
						<p className="text-xs text-gray-500">Available now</p>
						<p className="font-bold text-green-700">{seatsOffered}</p>
					</div>
				</div>

				{/* Scrollable body */}
				<div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">

					{/* Seat counter (only visible when multiple seats offered) */}
					{seatsOffered > 1 && (
						<div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4">
							<p className="mb-3 text-sm font-semibold text-gray-700">How many seats to accept:</p>
							<div className="flex items-center justify-between rounded-lg bg-white px-4 py-2">
								<button
									onClick={() => setAcceptCount((c) => Math.max(1, c - 1))}
									disabled={acceptCount <= 1 || isProcessing}
									className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
								>
									<MinusIcon className="h-5 w-5" />
								</button>
								<div className="text-center">
									<p className="text-3xl font-bold text-indigo-700">{acceptCount}</p>
									<p className="text-xs text-gray-500">seat{acceptCount !== 1 ? 's' : ''}</p>
								</div>
								<button
									onClick={() => setAcceptCount((c) => Math.min(seatsOffered, c + 1))}
									disabled={acceptCount >= seatsOffered || isProcessing}
									className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40"
								>
									<PlusIcon className="h-5 w-5" />
								</button>
							</div>
						</div>
					)}

					{/* ── Option 1: Book + stay in waitlist ── */}
					{remainingAfterAccept > 0 && (
						<button
							disabled={isProcessing}
							onClick={() => onChoose({ choice: 'book_and_stay', acceptedSeats: acceptCount })}
							className="flex w-full flex-col gap-1 rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4 text-left hover:border-indigo-500 hover:bg-indigo-100 disabled:opacity-50"
						>
							<div className="flex items-center gap-2">
								<span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">1</span>
								<span className="font-bold text-indigo-800">
									Book {acceptCount} seat{acceptCount !== 1 ? 's' : ''} &amp; stay in waitlist
								</span>
							</div>
							<p className="ml-8 text-sm text-indigo-700">
								You'll be redirected to choose seats. Afterwards you'll remain in the waitlist for{' '}
								<strong>{remainingAfterAccept} more seat{remainingAfterAccept !== 1 ? 's' : ''}</strong>.
								Your queue position is preserved.
							</p>
						</button>
					)}

					{/* ── Option 2: Book + leave waitlist ── */}
					<button
						disabled={isProcessing}
						onClick={() => onChoose({ choice: 'book_and_leave', acceptedSeats: acceptCount })}
						className="flex w-full flex-col gap-1 rounded-xl border-2 border-green-300 bg-green-50 p-4 text-left hover:border-green-500 hover:bg-green-100 disabled:opacity-50"
					>
						<div className="flex items-center gap-2">
							<span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
								{remainingAfterAccept > 0 ? '2' : '1'}
							</span>
							<span className="font-bold text-green-800">
								Book {acceptCount} seat{acceptCount !== 1 ? 's' : ''} &amp; leave waitlist
							</span>
						</div>
						<p className="ml-8 text-sm text-green-700">
							Accept these seats and remove your remaining request.
							{remainingAfterAccept > 0 && (
								<> The <strong>{remainingAfterAccept} remaining seat{remainingAfterAccept !== 1 ? 's' : ''}</strong> will be offered to the next person in queue.</>
							)}
						</p>
					</button>

					{/* ── Option 3: Decline offer ──
					    NOTE: the previous "Wait for all N seats" option was removed — skipping a
					    partial offer while holding the offered seats blocks users who need fewer
					    seats. Decline releases the held seats back to the queue. */}
					<button
						disabled={isProcessing}
						onClick={() => onChoose({ choice: 'decline' })}
						className="flex w-full flex-col gap-1 rounded-xl border-2 border-red-200 bg-red-50 p-4 text-left hover:border-red-400 hover:bg-red-100 disabled:opacity-50"
					>
						<div className="flex items-center gap-2">
							<span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
								{remainingAfterAccept > 0 ? '3' : '2'}
							</span>
							<span className="font-bold text-red-700">Decline this offer</span>
						</div>
						<p className="ml-8 text-sm text-red-600">
							Release these seats back to the queue and remove yourself from the waitlist entirely.
						</p>
					</button>

				</div>

				{/* Footer (fixed) */}
				<div className="flex shrink-0 justify-end border-t border-gray-100 px-6 py-3">
					<button
						onClick={onClose}
						disabled={isProcessing}
						className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
					>
						{isProcessing ? 'Processing...' : 'Cancel'}
					</button>
				</div>
			</div>
		</div>
	)
}

// ─── Full Offer Dialog ─────────────────────────────────────────────────────────
// Simple two-button confirm for a full offer (enough seats available).

const FullOfferDialog = ({ entry, isOpen, onAccept, onDecline, isProcessing }) => {
	if (!isOpen || !entry) return null
	const seatsOffered   = entry.offeredSeats?.length || 0
	const seatsRemaining = getSeatsRemaining(entry)

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
			<div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
				<div className="rounded-t-2xl border-b border-gray-200 bg-gradient-to-r from-amber-50 to-yellow-50 px-6 py-4">
					<h2 className="text-lg font-bold text-gray-800">Seat Offer!</h2>
					<p className="mt-1 text-sm text-gray-600">
						<strong>{seatsOffered} seat{seatsOffered !== 1 ? 's' : ''}</strong> {seatsOffered !== 1 ? 'are' : 'is'} available for your waitlist request.
					</p>
				</div>
				<div className="px-6 py-5 text-sm text-gray-600">
					<p>You requested <strong>{seatsRemaining} seat{seatsRemaining !== 1 ? 's' : ''}</strong> and all of them are available now.</p>
					<p className="mt-2">Accept to go to the seat selection screen and complete your booking.</p>
				</div>
				<div className="flex gap-3 border-t border-gray-100 px-6 py-4">
					<button
						onClick={onDecline}
						disabled={isProcessing}
						className="flex-1 rounded-xl border-2 border-gray-200 bg-white py-2.5 font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
					>
						Decline
					</button>
					<button
						onClick={onAccept}
						disabled={isProcessing}
						className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
					>
						<CheckCircleIcon className="h-5 w-5" />
						{isProcessing ? 'Processing...' : 'Accept & Select Seats'}
					</button>
				</div>
			</div>
		</div>
	)
}

// ─── Waitlist Card ─────────────────────────────────────────────────────────────

const WaitlistCard = ({
	entry, onOpenFullOffer, onOpenPartialOffer, onLeave,
	accepting, declining, leaving, onExpired, onGoToSeatMap, onViewTickets
}) => {
	const { showtime, status, seatsRequested, seatsAccepted, position, joinedAt, offeredSeats, offerExpiresAt, partialBookings } = entry
	const movie              = showtime?.movie
	const theater            = showtime?.theater
	const cinema             = theater?.cinema
	const seatsRemaining     = getSeatsRemaining(entry)
	const isOffer            = status === 'OFFERED'
	const isPartialOffer     = status === 'OFFER_PARTIAL'
	const isWaitlistingMore  = status === 'WAITLISTED' && seatsAccepted > 0   // re-queued after partial

	return (
		<div className={`rounded-xl border-2 bg-white shadow transition-all ${
			isPartialOffer || isOffer ? 'border-amber-400 shadow-amber-100' : 'border-indigo-100'
		}`}>

			{/* Offer header */}
			{(isOffer || isPartialOffer) && (
				<div className="flex flex-col gap-1 rounded-t-xl bg-amber-50 px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2 text-amber-800">
						<ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
						<span className="text-sm font-bold">
							{isPartialOffer ? 'Partial Seat Offer Available' : 'All Seats Available!'}
						</span>
					</div>
					<div className="flex items-center gap-1 text-sm text-amber-700">
						<ClockIcon className="h-4 w-4" />
						<span className="text-xs font-medium">Expires in:</span>
						<OfferCountdown offerExpiresAt={offerExpiresAt} onExpired={() => onExpired?.(entry._id)} />
					</div>
				</div>
			)}

			{/* Re-queued partial banner */}
			{isWaitlistingMore && (
				<div className="rounded-t-xl border-b border-blue-200 bg-blue-50 px-4 py-2">
					<div className="flex items-center gap-2 text-blue-800">
						<CheckCircleIcon className="h-5 w-5 shrink-0 text-blue-500" />
						<span className="text-sm font-bold">
							{seatsAccepted} seat{seatsAccepted !== 1 ? 's' : ''} booked · Waitlisting for {seatsRemaining} more
						</span>
					</div>
				</div>
			)}

			<div className="p-4">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex gap-3">
						{movie?.img ? (
							<img
								src={movie.img}
								alt={movie.name}
								className="h-16 w-11 shrink-0 rounded object-cover shadow"
								onError={(e) => { e.target.style.display = 'none' }}
							/>
						) : (
							<div className="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-indigo-100">
								<TicketIcon className="h-6 w-6 text-indigo-400" />
							</div>
						)}
						<div>
							<h3 className="font-bold text-gray-800">{movie?.name || '—'}</h3>
							<p className="text-sm text-gray-500">{cinema?.name} · Theater #{theater?.number}</p>
							<p className="text-sm font-semibold text-indigo-700">{fmtDate(showtime?.showtime)}</p>
							<div className="mt-1 flex flex-wrap gap-2 text-xs text-gray-500">
								<span>Requested: <strong>{seatsRequested} seat{seatsRequested !== 1 ? 's' : ''}</strong></span>
								{seatsAccepted > 0 && (
									<span>Booked so far: <strong>{seatsAccepted}</strong></span>
								)}
								{status === 'WAITLISTED' && seatsRemaining !== seatsRequested && (
									<span>Still waiting for: <strong>{seatsRemaining}</strong></span>
								)}
								{status === 'WAITLISTED' && position && (
									<span>Queue position: <strong>#{position}</strong></span>
								)}
								{(isOffer || isPartialOffer) && offeredSeats?.length > 0 && (
									<span>Available now: <strong>{offeredSeats.length} seat{offeredSeats.length !== 1 ? 's' : ''}</strong></span>
								)}
							</div>
						</div>
					</div>
					<div className="flex shrink-0 flex-col items-end gap-2">
						<StatusBadge status={status} />
						<span className="text-xs text-gray-400">Joined {fmtDate(joinedAt)}</span>
					</div>
				</div>

				{/* Partial offer summary */}
				{isPartialOffer && (
					<div className="mt-3 rounded-lg bg-orange-50 p-3">
						<div className="mb-2 grid grid-cols-2 gap-2 text-sm">
							<div className="rounded-lg border border-orange-200 bg-white p-2">
								<p className="text-xs text-gray-500">Still needed</p>
								<p className="text-lg font-bold text-gray-800">{seatsRemaining}</p>
							</div>
							<div className="rounded-lg border border-orange-400 bg-orange-100 p-2">
								<p className="text-xs font-semibold text-orange-700">Available now</p>
								<p className="text-lg font-bold text-orange-800">{offeredSeats?.length || 0}</p>
							</div>
						</div>
						<p className="text-xs text-orange-800">
							Choose how to handle this partial offer — you can book these seats and stay in queue for the rest.
						</p>
					</div>
				)}

				{/* Full offer summary */}
				{isOffer && (
					<div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
						All <strong>{offeredSeats?.length}</strong> seat{offeredSeats?.length !== 1 ? 's' : ''} you need are available. Accept to select your seats.
					</div>
				)}

				{/* Partial booking history */}
				{partialBookings?.length > 0 && (
					<div className="mt-3 rounded-lg bg-gray-50 p-3">
						<p className="mb-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Booking history</p>
						{partialBookings.map((pb, i) => (
							<div key={i} className="flex items-center gap-2 text-xs text-gray-600">
								<CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-green-500" />
								<span>
									Booked {pb.seatsBooked} seat{pb.seatsBooked !== 1 ? 's' : ''}
									{pb.seatLabels?.length > 0 && <> ({pb.seatLabels.join(', ')})</>}
									{' '}on {fmtDate(pb.bookedAt)}
								</span>
							</div>
						))}
					</div>
				)}

				{/* Action buttons */}
				<div className="mt-4 flex flex-wrap gap-2">
					{isOffer && (
						<>
							<button
								onClick={() => onOpenFullOffer(entry)}
								disabled={accepting}
								className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
							>
								<CheckCircleIcon className="h-4 w-4" />
								{accepting ? 'Processing...' : 'View Offer'}
							</button>
							<button
								onClick={() => onLeave(entry, true)}
								disabled={declining}
								className="flex items-center gap-1.5 rounded-lg bg-red-100 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-200 disabled:opacity-60"
							>
								<XCircleIcon className="h-4 w-4" />
								{declining ? 'Declining...' : 'Decline Offer'}
							</button>
						</>
					)}

					{isPartialOffer && (
						<button
							onClick={() => onOpenPartialOffer(entry)}
							disabled={accepting}
							className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60"
						>
							<ExclamationTriangleIcon className="h-4 w-4" />
							{accepting ? 'Processing...' : 'Choose What to Do'}
						</button>
					)}

					{status === 'WAITLISTED' && (
						<button
							onClick={() => onLeave(entry)}
							disabled={leaving}
							className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-60"
						>
							<XMarkIcon className="h-4 w-4" />
							{leaving ? 'Leaving...' : isWaitlistingMore ? 'Leave Remaining Waitlist' : 'Leave Waitlist'}
						</button>
					)}

					{/* CONFIRMED = booking already completed. Do NOT show "Select Seats"
					    (that wrongly sent the user back to the seat map to book again).
					    Offer a link to the finished tickets instead. */}
					{status === 'CONFIRMED' && (
						<button
							onClick={onViewTickets}
							className="flex items-center gap-1.5 rounded-lg bg-green-100 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-200"
						>
							<TicketIcon className="h-4 w-4" />
							View Tickets
						</button>
					)}
				</div>
			</div>
		</div>
	)
}

const EmptyState = ({ message }) => (
	<div className="flex flex-col items-center gap-3 rounded-xl bg-white py-12 text-center shadow">
		<QueueListIcon className="h-12 w-12 text-indigo-200" />
		<p className="text-gray-400">{message}</p>
	</div>
)

const TABS = ['Pending Offers', 'Active Waitlists', 'Past Waitlists']

// ═════════════════════════════════════════════════════════════════════════════

const MyWaitlists = () => {
	const { auth }   = useContext(AuthContext)
	const navigate   = useNavigate()

	const [entries, setEntries]       = useState([])
	const [loading, setLoading]       = useState(false)
	const [activeTab, setActiveTab]   = useState('Pending Offers')
	const [actingId, setActingId]     = useState(null)
	const [actingType, setActingType] = useState(null)

	// Dialog state
	const [fullOfferDialog,    setFullOfferDialog]    = useState({ isOpen: false, entry: null })
	const [partialOfferDialog, setPartialOfferDialog] = useState({ isOpen: false, entry: null })

	const socketRef  = useRef(null)
	const joinedRef  = useRef(false)
	const pollerRef  = useRef(null)
	const fetchRef   = useRef(null)

	// ── Data fetching ─────────────────────────────────────────────────────────

	const fetchMyWaitlists = async (silent = false) => {
		if (!auth.id) return
		if (!silent) setLoading(true)
		try {
			const res = await axios.get('/waitlist/my')
			setEntries(res.data.data || [])
		} catch (err) {
			if (!silent) {
				console.error('Failed to fetch waitlists:', err)
				toast.error('Failed to load waitlists', { position: 'top-center' })
			}
		} finally {
			if (!silent) setLoading(false)
		}
	}
	fetchRef.current = fetchMyWaitlists

	// ── Socket ────────────────────────────────────────────────────────────────

	useEffect(() => {
		if (!auth.id) return

		const socket = socketIO(apiBaseUrl, {
			auth: { userId: auth.id },
			reconnection: true,
			reconnectionDelay: 1000,
			reconnectionDelayMax: 5000,
			reconnectionAttempts: 5
		})

		socket.on('connect', () => {
			if (auth.id) {
				socket.emit('join:user', auth.id)
				joinedRef.current = true
			}
		})

		const refresh = () => fetchRef.current(true)

		socket.on('waitlistOfferCreated',    refresh)
		socket.on('waitlist:offer',          refresh)
		socket.on('waitlist:expired',        refresh)
		socket.on('waitlist:confirmed',      refresh)
		socket.on('waitlist:partial-accepted', refresh)
		socket.on('waitlist:requeued',       refresh)   // NEW: fired after partial re-queue

		socketRef.current = socket
		return () => socket.disconnect()
	}, [auth.id])

	useEffect(() => {
		if (!auth.id || !socketRef.current || joinedRef.current) return
		if (socketRef.current.connected) {
			socketRef.current.emit('join:user', auth.id)
			joinedRef.current = true
		}
	}, [auth.id])

	// 10-second polling fallback
	useEffect(() => {
		if (!auth.id) return
		pollerRef.current = setInterval(() => fetchRef.current(true), 10000)
		return () => clearInterval(pollerRef.current)
	}, [auth.id])

	// Initial load
	useEffect(() => {
		if (!auth.id) { navigate('/login'); return }
		fetchMyWaitlists()
	}, [])

	// ── UI expiry ─────────────────────────────────────────────────────────────

	const handleOfferExpiredInUI = (entryId) => {
		setEntries((prev) =>
			prev.map((e) => (String(e._id) === String(entryId) ? { ...e, status: 'EXPIRED' } : e))
		)
		fetchMyWaitlists(true)
	}

	// ── Tabs ──────────────────────────────────────────────────────────────────

	const offers = entries.filter((e) => ['OFFERED', 'OFFER_PARTIAL'].includes(e.status))
	// Active = WAITLISTED (including re-queued partial users)
	const active = entries.filter((e) => e.status === 'WAITLISTED')
	const past   = entries.filter((e) =>
		['ACCEPTED', 'CONFIRMED', 'EXPIRED', 'REJECTED', 'CANCELLED'].includes(e.status)
	)

	useEffect(() => {
		if (offers.length > 0) setActiveTab('Pending Offers')
	}, [offers.length])

	const tabCount = (tab) => {
		if (tab === 'Pending Offers')   return offers.length
		if (tab === 'Active Waitlists') return active.length
		return past.length
	}

	const currentList = () => {
		if (activeTab === 'Pending Offers')   return offers
		if (activeTab === 'Active Waitlists') return active
		return past
	}

	const emptyMsg = () => {
		if (activeTab === 'Pending Offers')   return 'No pending seat offers right now.'
		if (activeTab === 'Active Waitlists') return "You're not on any active waitlist."
		return 'No past waitlist entries.'
	}

	// ── Accept full offer ─────────────────────────────────────────────────────

	const handleFullOfferAccept = async () => {
		const entry = fullOfferDialog.entry
		setActingId(entry._id); setActingType('accept')
		try {
			const res = await axios.post(
				`/waitlist/${entry.showtime._id}/accept`,
				{}
			)
			toast.success('Offer accepted! Redirecting to seat selection...', { position: 'top-center', autoClose: 2500 })
			setFullOfferDialog({ isOpen: false, entry: null })
			setTimeout(() => {
				navigate(`/showtime/${entry.showtime._id}`, {
					state: {
						ticketCount:       res.data.data?.seatsRequested || entry.seatsRequested,
						isWaitlistBooking: true
					}
				})
			}, 1500)
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Could not accept offer', { position: 'top-center' })
			fetchMyWaitlists()
		} finally {
			setActingId(null); setActingType(null)
		}
	}

	const handleFullOfferDecline = async () => {
		const entry = fullOfferDialog.entry
		if (!window.confirm('Decline this offer? You will be removed from the waitlist.')) return
		setActingId(entry._id); setActingType('decline')
		try {
			await axios.post(
				`/waitlist/${entry.showtime._id}/decline`,
				{}
			)
			toast.success('Offer declined.', { position: 'top-center' })
			setFullOfferDialog({ isOpen: false, entry: null })
			fetchMyWaitlists()
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Could not decline offer', { position: 'top-center' })
		} finally {
			setActingId(null); setActingType(null)
		}
	}

	// ── Handle partial offer choices ──────────────────────────────────────────

	const handlePartialChoice = async ({ choice, acceptedSeats }) => {
		const entry = partialOfferDialog.entry
		setActingId(entry._id); setActingType('accept')
		try {
			const res = await axios.post(
				`/waitlist/${entry.showtime._id}/accept`,
				{ choice, acceptedSeats }
			)

			setPartialOfferDialog({ isOpen: false, entry: null })

			if (choice === 'decline') {
				toast.success('Offer declined.', { position: 'top-center' })
				fetchMyWaitlists()
				return
			}

			const { stayInWaitlist, remainingInWaitlist } = res.data.data || {}
			const accepted = acceptedSeats || entry.offeredSeats?.length

			if (stayInWaitlist) {
				toast.success(
					`Booked ${accepted} seat${accepted !== 1 ? 's' : ''}! You're still in queue for ${remainingInWaitlist} more.`,
					{ position: 'top-center', autoClose: 3000 }
				)
			} else {
				toast.success('Offer accepted! Redirecting to seat selection...', { position: 'top-center', autoClose: 2500 })
			}

			setTimeout(() => {
				navigate(`/showtime/${entry.showtime._id}`, {
					state: {
						ticketCount:       accepted,
						isWaitlistBooking: true,
						stayInWaitlist:    stayInWaitlist || false
					}
				})
			}, 1500)
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Could not process your choice', { position: 'top-center' })
			fetchMyWaitlists()
		} finally {
			setActingId(null); setActingType(null)
		}
	}

	// ── Leave / decline from card (no dialog needed) ──────────────────────────

	const handleLeave = async (entry, isDecline = false) => {
		const msg = isDecline
			? 'Decline this offer? You will be removed from the waitlist.'
			: 'Leave this waitlist?'
		if (!window.confirm(msg)) return

		setActingId(entry._id); setActingType(isDecline ? 'decline' : 'leave')
		try {
			if (isDecline) {
				await axios.post(
					`/waitlist/${entry.showtime._id}/decline`,
					{}
				)
				toast.success('Offer declined.', { position: 'top-center' })
			} else {
				await axios.delete(
					`/waitlist/${entry.showtime._id}`
				)
				toast.success('Removed from waitlist.', { position: 'top-center' })
			}
			fetchMyWaitlists()
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Could not complete action', { position: 'top-center' })
		} finally {
			setActingId(null); setActingType(null)
		}
	}

	const handleGoToSeatMap = ({ showtimeId, ticketCount }) => {
		navigate(`/showtime/${showtimeId}`, {
			state: { ticketCount: ticketCount || 1, isWaitlistBooking: true }
		})
	}

	// ─────────────────────────────────────────────────────────────────────────

	return (
		<div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-900 to-blue-500">
			<Navbar />
			<div className="mx-4 my-6 flex flex-col gap-5 sm:mx-8">

				{/* Page header */}
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-extrabold text-white drop-shadow sm:text-3xl">My Waitlists</h1>
						<p className="mt-0.5 text-sm text-indigo-200">Track your seat requests and pending offers</p>
					</div>
					<button
						onClick={() => fetchMyWaitlists()}
						disabled={loading}
						className="flex items-center gap-1.5 rounded-lg bg-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/30 disabled:opacity-60"
					>
						<ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
						Refresh
					</button>
				</div>

				{/* Tabs */}
				<div className="flex flex-wrap gap-2">
					{TABS.map((tab) => {
						const count = tabCount(tab)
						return (
							<button
								key={tab}
								onClick={() => setActiveTab(tab)}
								className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
									activeTab === tab
										? 'bg-white text-indigo-700 shadow'
										: 'bg-white/20 text-white hover:bg-white/30'
								}`}
							>
								{tab}
								{count > 0 && (
									<span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
										tab === 'Pending Offers'
											? 'bg-amber-400 text-amber-900'
											: activeTab === tab
											? 'bg-indigo-100 text-indigo-700'
											: 'bg-white/30 text-white'
									}`}>
										{count}
									</span>
								)}
							</button>
						)
					})}
				</div>

				{/* Content */}
				{loading && entries.length === 0 ? (
					<div className="flex items-center justify-center py-20 text-white">Loading...</div>
				) : currentList().length === 0 ? (
					<EmptyState message={emptyMsg()} />
				) : (
					<div className="flex flex-col gap-4">
						{currentList().map((entry) => (
							<WaitlistCard
								key={entry._id}
								entry={entry}
								onOpenFullOffer={(e)    => setFullOfferDialog({ isOpen: true, entry: e })}
								onOpenPartialOffer={(e) => setPartialOfferDialog({ isOpen: true, entry: e })}
								onLeave={handleLeave}
								onExpired={handleOfferExpiredInUI}
								onGoToSeatMap={handleGoToSeatMap}
								onViewTickets={() => navigate('/ticket')}
								accepting={actingId === entry._id && actingType === 'accept'}
								declining={actingId === entry._id && actingType === 'decline'}
								leaving={actingId === entry._id && actingType === 'leave'}
							/>
						))}
					</div>
				)}
			</div>

			{/* Full Offer Dialog */}
			<FullOfferDialog
				entry={fullOfferDialog.entry}
				isOpen={fullOfferDialog.isOpen}
				onAccept={handleFullOfferAccept}
				onDecline={handleFullOfferDecline}
				isProcessing={actingType === 'accept'}
			/>

			{/* Partial Offer Dialog — three options */}
			<PartialOfferDialog
				entry={partialOfferDialog.entry}
				isOpen={partialOfferDialog.isOpen}
				onChoose={handlePartialChoice}
				onClose={() => setPartialOfferDialog({ isOpen: false, entry: null })}
				isProcessing={actingType === 'accept'}
			/>
		</div>
	)
}

export default MyWaitlists