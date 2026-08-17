import axios from '../config/axiosConfig'
import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Loading from '../components/Loading'
import Navbar from '../components/Navbar'
import { AuthContext } from '../context/AuthContext'
import {
	CheckCircleIcon,
	ClockIcon,
	QrCodeIcon,
	TicketIcon,
	TrashIcon,
	XCircleIcon
} from '@heroicons/react/24/solid'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d) =>
	d
		? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
		: '—'

// ─── Ticket Card ─────────────────────────────────────────────────────────────

const TicketCard = ({ ticket, onView, onCancel }) => {
	const showtime = ticket.showtime
	const movie    = showtime?.movie
	const theater  = showtime?.theater
	const cinema   = theater?.cinema
	const seats    = ticket.seats.map((s) => `${s.row}${s.number}`)
	const isPast   = showtime?.showtime && new Date(showtime.showtime) < new Date()

	const statusBadge = () => {
		if (ticket.isCancelled) return (
			<span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
				<XCircleIcon className="h-3.5 w-3.5" /> Cancelled
			</span>
		)
		if (ticket.isUsed) return (
			<span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
				<XCircleIcon className="h-3.5 w-3.5" /> Used
			</span>
		)
		if (isPast) return (
			<span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
				<ClockIcon className="h-3.5 w-3.5" /> Expired
			</span>
		)
		return (
			<span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
				<CheckCircleIcon className="h-3.5 w-3.5" /> Valid
			</span>
		)
	}

	return (
		<div className="flex flex-col overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-md transition-shadow hover:shadow-lg">
			{/* Top stripe */}
			<div className="flex items-center justify-between bg-gradient-to-r from-indigo-800 to-blue-700 px-4 py-3">
				<div className="flex items-center gap-2">
					<TicketIcon className="h-5 w-5 text-white" />
					<span className="font-mono text-sm font-bold text-white">{ticket.ticketId}</span>
				</div>
				{statusBadge()}
			</div>

			{/* Body */}
			<div className="flex flex-1 gap-4 p-4">
				{/* Details */}
				<div className="flex flex-1 flex-col gap-2">
					<p className="text-lg font-bold text-indigo-900 leading-tight">
						{movie?.name || '—'}
					</p>

					<p className="text-sm text-gray-600">
						<span className="font-medium">{cinema?.name}</span>
						{theater?.number ? ` · Theater ${theater.number}` : ''}
					</p>

					<p className="text-sm text-gray-500">{fmtDate(showtime?.showtime)}</p>

					<div className="flex flex-wrap gap-1.5 pt-1">
						{seats.map((s) => (
							<span
								key={s}
								className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700"
							>
								{s}
							</span>
						))}
					</div>

					<p className="mt-auto pt-2 text-sm font-semibold text-gray-700">
						₹{ticket.amountPaid}
					</p>
				</div>

				{/* QR thumbnail */}
				{ticket.qrCodeDataUrl && (
					<div className="flex shrink-0 flex-col items-center gap-1">
						<img
							src={ticket.qrCodeDataUrl}
							alt="QR"
							className="h-20 w-20 rounded-md border border-indigo-100"
						/>
						<span className="text-xs text-gray-400">Scan at venue</span>
					</div>
				)}
			</div>

			{/* Footer action */}
			<div className="flex gap-2 border-t border-indigo-50 px-4 py-3">
				<button
					onClick={() => onView(ticket.ticketId)}
					className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500 py-2 text-sm font-semibold text-white hover:from-indigo-500 hover:to-blue-400"
				>
					<QrCodeIcon className="h-4 w-4" />
					View Full Ticket
				</button>
				{!ticket.isUsed && !ticket.isCancelled && !isPast && (
					<button
						onClick={() => onCancel(ticket.ticketId)}
						className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 py-2 text-sm font-semibold text-white hover:bg-red-400"
					>
						<TrashIcon className="h-4 w-4" />
						Cancel &amp; Refund
					</button>
				)}
			</div>
		</div>
	)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const Tickets = () => {
	const { auth } = useContext(AuthContext)
	const { setAuth } = useContext(AuthContext)
	const navigate = useNavigate()

	const [tickets, setTickets] = useState([])
	const [loading, setLoading] = useState(true)

	const fetchTickets = async () => {
		try {
			setLoading(true)
			const res = await axios.get('/ticket')
			setTickets(res.data.data || [])
		} catch (err) {
			const status = err?.response?.status
			if (status === 401) {
				setAuth({ id: null, username: null, email: null, role: null, token: null })
				navigate('/login')
				return
			}
			console.error('fetchTickets error:', err)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		fetchTickets()
	}, [])

	const upcoming = tickets.filter(
		(t) => !t.isUsed && !t.isCancelled && t.showtime?.showtime && new Date(t.showtime.showtime) >= new Date()
	)
	const past = tickets.filter(
		(t) => t.isUsed || t.isCancelled || !t.showtime?.showtime || new Date(t.showtime.showtime) < new Date()
	)

	return (
		<div className="flex min-h-screen flex-col gap-4 bg-gradient-to-br from-indigo-900 to-blue-500 pb-8 text-gray-900 sm:gap-8">
			<Navbar />
			<div className="mx-4 flex h-fit flex-col gap-6 rounded-2xl bg-gradient-to-br from-indigo-200 to-blue-100 p-4 drop-shadow-xl sm:mx-8 sm:p-6">

				<h2 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
					<TicketIcon className="h-8 w-8 text-indigo-600" />
					My Tickets
				</h2>

				{loading ? (
					<Loading />
				) : tickets.length === 0 ? (
					<div className="flex flex-col items-center gap-3 py-16 text-center text-gray-500">
						<TicketIcon className="h-14 w-14 opacity-30" />
						<p className="text-lg font-medium">No tickets yet</p>
						<p className="text-sm">Book a movie to see your tickets here</p>
						<button
							onClick={() => navigate('/cinema')}
							className="mt-2 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
						>
							Browse Shows
						</button>
					</div>
				) : (
					<>
						{/* Upcoming */}
						{upcoming.length > 0 && (
							<section>
								<h3 className="mb-3 text-lg font-bold text-indigo-800">Upcoming ({upcoming.length})</h3>
								<div className="grid grid-cols-1 gap-4 xl:grid-cols-2 min-[1920px]:grid-cols-3">
									{upcoming.map((t) => (
										<TicketCard
											key={t._id}
											ticket={t}
											onView={(id) => navigate(`/ticket/${id}`)}
											onCancel={(id) => navigate(`/ticket/${id}?cancel=1`)}
										/>
									))}
								</div>
							</section>
						)}

						{/* Past / Used */}
						{past.length > 0 && (
							<section>
								<h3 className="mb-3 text-lg font-bold text-gray-500">
									Past &amp; Used ({past.length})
								</h3>
								<div className="grid grid-cols-1 gap-4 opacity-75 xl:grid-cols-2 min-[1920px]:grid-cols-3">
									{past.map((t) => (
										<TicketCard
											key={t._id}
											ticket={t}
											onView={(id) => navigate(`/ticket/${id}`)}
											onCancel={(id) => navigate(`/ticket/${id}?cancel=1`)}
										/>
									))}
								</div>
							</section>
						)}
					</>
				)}
			</div>
		</div>
	)
}

export default Tickets