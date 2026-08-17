import {
	ArrowDownTrayIcon,
	CheckBadgeIcon,
	CheckCircleIcon,
	ClockIcon,
	ExclamationTriangleIcon,
	MapPinIcon,
	TicketIcon,
	TrashIcon,
	XCircleIcon
} from '@heroicons/react/24/solid'
import axios from '../config/axiosConfig'
import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import Loading from '../components/Loading'
import Navbar from '../components/Navbar'
import { AuthContext } from '../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d) =>
	d
		? new Date(d).toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })
		: '—'

const fmtShort = (d) =>
	d
		? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
		: '—'

// ─── Component ────────────────────────────────────────────────────────────────

const TicketDetail = () => {
	const { id } = useParams()          // ticketId = "TKT-XXXXXXXX"
	const { auth } = useContext(AuthContext)
	const navigate = useNavigate()
	const [searchParams, setSearchParams] = useSearchParams()

	const [ticket, setTicket] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [downloading, setDownloading] = useState(false)
	const [cancelling, setCancelling] = useState(false)

	const printRef = useRef(null)
	const autoCancelStarted = useRef(false)

	// ── Fetch ticket ──────────────────────────────────────────────────────────
	const fetchTicket = async () => {
		try {
			setLoading(true)
			const res = await axios.get(`/ticket/${id}`)
			setTicket(res.data.data)
			setError(null)
		} catch (err) {
			setError(err?.response?.data?.message || 'Ticket not found')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		if (!auth.id) {
			navigate('/login')
			return
		}

		fetchTicket()
	}, [id])

	useEffect(() => {
		if (ticket && searchParams.get('cancel') === '1' && !autoCancelStarted.current) {
			autoCancelStarted.current = true
			setSearchParams({}, { replace: true })
			handleCancel()
		}
	}, [ticket])

	const handleCancel = async () => {
		if (!ticket || ticket.isUsed || ticket.isCancelled) return
		setCancelling(true)

		try {
			const headers = {}
			const previewRes = await axios.get(`/cancel/preview/${ticket.ticketId}`, { headers })
			const preview = previewRes.data.data
			const confirmed = window.confirm(
				`Cancel ${ticket.ticketId}?\n\n` +
				`Original amount: ₹${preview.originalAmount}\n` +
				`Cancellation fee: ₹${preview.feeINR} (${preview.feePercent}%)\n` +
				`Refund amount: ₹${preview.refundAmountINR}\n\n` +
				'The refund will be sent to the original payment method.'
			)

			if (!confirmed) return

			const cancelRes = await axios.post(`/cancel/ticket/${ticket.ticketId}`, {}, { headers })
			toast.success(cancelRes.data.message, { position: 'top-center', autoClose: 4000 })
			await fetchTicket()
		} catch (err) {
			toast.error(err?.response?.data?.message || 'Unable to cancel ticket', {
				position: 'top-center',
				autoClose: 4000
			})
		} finally {
			setCancelling(false)
		}
	}

	// ── Download as PNG using canvas ──────────────────────────────────────────
	const handleDownload = async () => {
		if (!ticket) return
		setDownloading(true)

		try {
			const el = printRef.current
			if (!el) return

			// Dynamically import html2canvas only when needed
			const html2canvas = (await import('html2canvas')).default

			const canvas = await html2canvas(el, {
				scale: 2,
				useCORS: true,
				backgroundColor: '#ffffff',
				logging: false
			})

			const link = document.createElement('a')
			link.download = `${ticket.ticketId}.png`
			link.href = canvas.toDataURL('image/png')
			link.click()

			toast.success('Ticket downloaded!', { position: 'top-center', autoClose: 2000 })
		} catch (err) {
			console.error('Download failed:', err)
			// Fallback: open QR in new tab if html2canvas fails
			if (ticket.qrCodeDataUrl) {
				const w = window.open()
				w.document.write(`<img src="${ticket.qrCodeDataUrl}" style="max-width:300px"/>`)
			}
			toast.error('Could not generate image — try printing instead', {
				position: 'top-center',
				autoClose: 3000
			})
		} finally {
			setDownloading(false)
		}
	}

	// ── Render states ─────────────────────────────────────────────────────────

	if (loading) {
		return (
			<div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-900 to-blue-500">
				<Navbar />
				<Loading />
			</div>
		)
	}

	if (error) {
		return (
			<div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-900 to-blue-500">
				<Navbar />
				<div className="mx-auto mt-20 flex flex-col items-center gap-4 text-white">
					<XCircleIcon className="h-16 w-16 text-red-400" />
					<p className="text-xl font-bold">{error}</p>
					<button
						onClick={() => navigate('/ticket')}
						className="rounded-lg bg-white px-6 py-2 font-semibold text-indigo-700 hover:bg-indigo-50"
					>
						← Back to My Tickets
					</button>
				</div>
			</div>
		)
	}

	if (!ticket) return null

	const showtime  = ticket.showtime
	const movie     = showtime?.movie
	const theater   = showtime?.theater
	const cinema    = theater?.cinema
	const seats     = ticket.seats.map((s) => `${s.row}${s.number}`)
	const isPast    = showtime?.showtime && new Date(showtime.showtime) < new Date()

	// ── Main render ───────────────────────────────────────────────────────────

	return (
		<div className="flex min-h-screen flex-col gap-6 bg-gradient-to-br from-indigo-900 to-blue-500 pb-10">
			<Navbar />

			{/* Action bar */}
			<div className="mx-4 flex flex-wrap items-center justify-between gap-3 sm:mx-8">
				<button
					onClick={() => navigate('/ticket')}
					className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
				>
					← My Tickets
				</button>

				<div className="flex flex-wrap gap-2">
					{!ticket.isUsed && !ticket.isCancelled && !isPast && (
						<button
							onClick={handleCancel}
							disabled={cancelling}
							className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-60"
						>
							<TrashIcon className="h-4 w-4" />
							{cancelling ? 'Checking Refund...' : 'Cancel & Refund'}
						</button>
					)}
					<button
						onClick={handleDownload}
						disabled={downloading}
						className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
					>
						<ArrowDownTrayIcon className="h-4 w-4" />
						{downloading ? 'Generating...' : 'Download Ticket'}
					</button>
				</div>
			</div>

			{/* ── Printable ticket card ── */}
			<div className="mx-4 sm:mx-8">
				<div
					ref={printRef}
					className="overflow-hidden rounded-2xl bg-white shadow-2xl"
					style={{ fontFamily: 'system-ui, sans-serif' }}
				>
					{/* Header stripe */}
					<div className="bg-gradient-to-r from-indigo-800 to-blue-700 px-6 py-5">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-3">
								<div className="rounded-full bg-white/20 p-2">
									<TicketIcon className="h-7 w-7 text-white" />
								</div>
								<div>
									<p className="text-xs font-medium uppercase tracking-widest text-indigo-200">
										CineBooker • E-Ticket
									</p>
									<p className="text-xl font-bold text-white">{ticket.ticketId}</p>
								</div>
							</div>

							{/* Used badge */}
							{ticket.isCancelled ? (
								<span className="flex items-center gap-1.5 rounded-full bg-gray-500 px-3 py-1 text-xs font-bold text-white">
									<XCircleIcon className="h-4 w-4" />
									Cancelled
								</span>
							) : ticket.isUsed ? (
								<span className="flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white">
									<XCircleIcon className="h-4 w-4" />
									Used
								</span>
							) : isPast ? (
								<span className="flex items-center gap-1.5 rounded-full bg-gray-400 px-3 py-1 text-xs font-bold text-white">
									<ClockIcon className="h-4 w-4" />
									Expired
								</span>
							) : (
								<span className="flex items-center gap-1.5 rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white">
									<CheckCircleIcon className="h-4 w-4" />
									Valid
								</span>
							)}
						</div>
					</div>

					{/* Body */}
					<div className="flex flex-col gap-0 sm:flex-row">
						{/* ── Left: ticket details ── */}
						<div className="flex flex-1 flex-col gap-5 p-6">

							{/* Movie */}
							<div>
								<p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Movie</p>
								<p className="text-2xl font-bold text-indigo-900">{movie?.name || '—'}</p>
								<div className="mt-1 flex flex-wrap gap-2">
									{movie?.genre?.map((g) => (
										<span
											key={g}
											className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
										>
											{g}
										</span>
									))}
									{movie?.length && (
										<span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
											<ClockIcon className="h-3 w-3" />
											{movie.length} min
										</span>
									)}
								</div>
							</div>

							{/* Showtime */}
							<div className="rounded-xl bg-indigo-50 p-4">
								<p className="mb-1 text-xs font-semibold uppercase tracking-wider text-indigo-400">
									Date &amp; Time
								</p>
								<p className="text-lg font-bold text-indigo-900">{fmtDate(showtime?.showtime)}</p>
							</div>

							{/* Venue */}
							<div className="flex items-start gap-3">
								<MapPinIcon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
								<div>
									<p className="font-bold text-gray-900">{cinema?.name || '—'}</p>
									<p className="text-sm text-gray-500">
										Theater {theater?.number}
									</p>
								</div>
							</div>

							{/* Seats */}
							<div>
								<p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Seats</p>
								<div className="flex flex-wrap gap-2">
									{seats.map((s) => (
										<span
											key={s}
											className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white"
										>
											{s}
										</span>
									))}
								</div>
							</div>

							{/* Amount */}
							<div className="flex items-center justify-between border-t border-gray-100 pt-4">
								<p className="text-sm font-semibold text-gray-500">Amount Paid</p>
								<p className="text-xl font-bold text-indigo-700">₹{ticket.amountPaid}</p>
							</div>

							{/* Booking meta */}
							<div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-400">
								<p>Booked: {fmtShort(ticket.bookedAt)}</p>
								{ticket.razorpayPaymentId && (
									<p className="mt-0.5 font-mono">Payment: {ticket.razorpayPaymentId}</p>
								)}
								{ticket.isUsed && (
									<p className="mt-0.5 font-semibold text-red-500">
										Used: {fmtShort(ticket.usedAt)}
										{ticket.usedBy ? ` by ${ticket.usedBy.username}` : ''}
									</p>
								)}
								{ticket.isCancelled && (
									<p className="mt-0.5 font-semibold text-gray-600">
										Cancelled: {fmtShort(ticket.cancelledAt)} · Refund: ₹{ticket.refundAmount}
									</p>
								)}
							</div>
						</div>

						{/* ── Tear line ── */}
						<div className="flex items-center">
							<div className="hidden h-full w-px border-l-2 border-dashed border-gray-200 sm:block" />
							<div className="h-px w-full border-t-2 border-dashed border-gray-200 sm:hidden" />
						</div>

						{/* ── Right: QR code ── */}
						<div className="flex flex-col items-center justify-center gap-3 bg-indigo-50 p-6 sm:w-56">
							{ticket.qrCodeDataUrl ? (
								<>
									<img
										src={ticket.qrCodeDataUrl}
										alt="Ticket QR Code"
										className="h-44 w-44 rounded-lg"
									/>
									<p className="text-center text-xs text-gray-400">
										Show this QR at the venue
									</p>
								</>
							) : (
								<div className="flex h-44 w-44 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
									QR unavailable
								</div>
							)}

							<div className="flex items-center gap-1 text-xs font-semibold text-indigo-500">
								<CheckBadgeIcon className="h-4 w-4" />
								Verified Ticket
							</div>
						</div>
					</div>

					{/* Footer */}
					<div className="bg-gradient-to-r from-indigo-800 to-blue-700 px-6 py-3 text-center text-xs text-indigo-200">
						🔒 Secured by CineBooker &nbsp;·&nbsp; One QR per booking &nbsp;·&nbsp; Not transferable
					</div>
				</div>
			</div>
		</div>
	)
}

export default TicketDetail