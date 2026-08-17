import {
	ArrowPathIcon,
	CheckCircleIcon,
	ExclamationTriangleIcon,
	QrCodeIcon,
	XCircleIcon
} from '@heroicons/react/24/solid'
import axios from '../config/axiosConfig'
import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import Navbar from '../components/Navbar'
import { AuthContext } from '../context/AuthContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d) =>
	d
		? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
		: '—'

// ─── Result Card ──────────────────────────────────────────────────────────────

const ResultCard = ({ result }) => {
	if (!result) return null

	const { valid, alreadyUsed, message, data } = result

	const bg   = valid   ? 'from-green-50 to-emerald-50 border-green-200'
		       : alreadyUsed ? 'from-red-50 to-rose-50 border-red-200'
		       :               'from-amber-50 to-yellow-50 border-amber-200'

	const Icon = valid   ? CheckCircleIcon
		       : alreadyUsed ? XCircleIcon
		       :               ExclamationTriangleIcon

	const iconColor = valid ? 'text-green-500' : alreadyUsed ? 'text-red-500' : 'text-amber-500'

	return (
		<div className={`rounded-2xl border-2 bg-gradient-to-br p-5 shadow ${bg}`}>
			<div className="mb-4 flex items-center gap-3">
				<Icon className={`h-10 w-10 ${iconColor}`} />
				<p className={`text-lg font-bold ${valid ? 'text-green-700' : alreadyUsed ? 'text-red-700' : 'text-amber-700'}`}>
					{message}
				</p>
			</div>

			{data && (
				<div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
					<InfoCell label="Ticket ID"  value={data.ticketId} />
					<InfoCell label="Movie"      value={data.showtime?.movie?.name} />
					<InfoCell label="Showtime"   value={fmtDate(data.showtime?.showtime)} />
					<InfoCell label="Theater"    value={`${data.showtime?.theater?.cinema?.name} · T${data.showtime?.theater?.number}`} />
					<InfoCell label="Seats"      value={Array.isArray(data.seats) ? data.seats.join(', ') : data.seats?.map?.((s) => `${s.row}${s.number}`).join(', ')} />
					<InfoCell label="Paid"       value={data.amountPaid ? `₹${data.amountPaid}` : undefined} />
					{data.usedAt && <InfoCell label="Used At" value={fmtDate(data.usedAt)} />}
					{data.user?.username && <InfoCell label="Booked By" value={data.user.username} />}
				</div>
			)}
		</div>
	)
}

const InfoCell = ({ label, value }) => (
	<div className="rounded-lg bg-white/70 p-2.5">
		<p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p>
		<p className="mt-0.5 font-semibold text-gray-800">{value || '—'}</p>
	</div>
)

// ─── Scanner Page ─────────────────────────────────────────────────────────────

const TicketScanner = () => {
	const { auth } = useContext(AuthContext)
	const navigate = useNavigate()

	const [manualInput, setManualInput] = useState('')
	const [loading, setLoading]         = useState(false)
	const [result, setResult]           = useState(null)
	const [cameraActive, setCameraActive] = useState(false)
	const [cameraError, setCameraError]   = useState(null)

	const videoRef  = useRef(null)
	const canvasRef = useRef(null)
	const streamRef = useRef(null)
	const scanLoop  = useRef(null)

	// Guard — admin only
	useEffect(() => {
		if (auth.role !== 'admin') navigate('/')
	}, [])

	// ── Camera / QR scanning ──────────────────────────────────────────────────

	const stopCamera = () => {
		if (scanLoop.current) cancelAnimationFrame(scanLoop.current)
		if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
		streamRef.current = null
		setCameraActive(false)
	}

	const startCamera = async () => {
		setCameraError(null)
		setResult(null)

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
			})
			streamRef.current = stream

			if (videoRef.current) {
				videoRef.current.srcObject = stream
				await videoRef.current.play()
			}

			setCameraActive(true)
			scanFrame()
		} catch (err) {
			setCameraError('Camera access denied or unavailable. Use manual entry below.')
			console.error('Camera error:', err)
		}
	}

	const scanFrame = () => {
		const video  = videoRef.current
		const canvas = canvasRef.current

		if (!video || !canvas || video.readyState !== 4) {
			scanLoop.current = requestAnimationFrame(scanFrame)
			return
		}

		canvas.width  = video.videoWidth
		canvas.height = video.videoHeight
		const ctx = canvas.getContext('2d')
		ctx.drawImage(video, 0, 0)

		// Use BarcodeDetector API if available (Chrome 88+, Android)
		if ('BarcodeDetector' in window) {
			const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
			detector.detect(canvas).then((barcodes) => {
				if (barcodes.length > 0) {
					const raw = barcodes[0].rawValue
					stopCamera()
					submitValidation(raw)
				} else {
					scanLoop.current = requestAnimationFrame(scanFrame)
				}
			}).catch(() => {
				scanLoop.current = requestAnimationFrame(scanFrame)
			})
		} else {
			// BarcodeDetector not available — camera UI stays active but can't decode.
			// User must type manually.
			scanLoop.current = requestAnimationFrame(scanFrame)
			setCameraError('QR scanning requires Chrome 88+ or Android. Please use manual entry.')
			stopCamera()
		}
	}

	useEffect(() => () => stopCamera(), [])

	// ── Validation ────────────────────────────────────────────────────────────

	const submitValidation = async (rawQrOrTicketId) => {
		if (!rawQrOrTicketId?.trim()) return
		setLoading(true)
		setResult(null)

		try {
			// Try to detect whether this looks like a JSON QR payload or plain ticketId
			let body
			const trimmed = rawQrOrTicketId.trim()
			if (trimmed.startsWith('{')) {
				body = { qrPayload: trimmed }
			} else {
				body = { ticketId: trimmed }
			}

			const res = await axios.post('/ticket/validate', body)

			setResult(res.data)
			if (res.data.valid) {
				toast.success('Ticket validated!', { position: 'top-center', autoClose: 2000 })
			}
		} catch (err) {
			const data = err?.response?.data || {}
			setResult({
				valid:       false,
				alreadyUsed: data.alreadyUsed || false,
				message:     data.message || 'Validation failed',
				data:        data.data || null
			})
		} finally {
			setLoading(false)
		}
	}

	const handleManualSubmit = (e) => {
		e.preventDefault()
		submitValidation(manualInput)
	}

	const handleReset = () => {
		setResult(null)
		setManualInput('')
	}

	// ── Render ────────────────────────────────────────────────────────────────

	return (
		<div className="flex min-h-screen flex-col gap-6 bg-gradient-to-br from-indigo-900 to-blue-500 pb-10">
			<Navbar />

			<div className="mx-4 sm:mx-8 max-w-2xl xl:mx-auto w-full">
				{/* Header */}
				<div className="mb-6 flex items-center gap-3">
					<div className="rounded-xl bg-indigo-600 p-3">
						<QrCodeIcon className="h-7 w-7 text-white" />
					</div>
					<div>
						<h1 className="text-2xl font-bold text-white">Ticket Scanner</h1>
						<p className="text-sm text-indigo-200">Scan or enter a ticket ID to validate entry</p>
					</div>
				</div>

				{/* Camera section */}
				<div className="mb-4 overflow-hidden rounded-2xl bg-white/10 backdrop-blur">
					<div className="p-4">
						{!cameraActive ? (
							<button
								onClick={startCamera}
								className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-500"
							>
								<QrCodeIcon className="h-5 w-5" />
								Scan QR with Camera
							</button>
						) : (
							<div className="flex flex-col items-center gap-3">
								<div className="relative w-full max-w-sm overflow-hidden rounded-xl">
									<video
										ref={videoRef}
										playsInline
										muted
										className="w-full rounded-xl bg-black"
									/>
									{/* Overlay guide */}
									<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
										<div className="h-48 w-48 rounded-xl border-4 border-white/70 shadow-lg" />
									</div>
								</div>
								<canvas ref={canvasRef} className="hidden" />
								<p className="text-sm text-indigo-100">Point camera at QR code...</p>
								<button
									onClick={stopCamera}
									className="rounded-lg bg-red-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-400"
								>
									Stop Camera
								</button>
							</div>
						)}

						{cameraError && (
							<p className="mt-2 text-center text-sm text-amber-300">{cameraError}</p>
						)}
					</div>
				</div>

				{/* Manual entry */}
				<div className="mb-4 rounded-2xl bg-white/10 p-4 backdrop-blur">
					<p className="mb-2 text-sm font-semibold text-indigo-100">Manual Entry</p>
					<form onSubmit={handleManualSubmit} className="flex gap-2">
						<input
							type="text"
							value={manualInput}
							onChange={(e) => setManualInput(e.target.value)}
							placeholder="TKT-XXXXXXXX or paste QR JSON"
							className="flex-1 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
						/>
						<button
							type="submit"
							disabled={loading || !manualInput.trim()}
							className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
						>
							{loading ? (
								<ArrowPathIcon className="h-4 w-4 animate-spin" />
							) : (
								'Validate'
							)}
						</button>
					</form>
				</div>

				{/* Result */}
				{result && (
					<div className="flex flex-col gap-3">
						<ResultCard result={result} />
						<button
							onClick={handleReset}
							className="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-sm font-semibold text-white hover:bg-white/20"
						>
							<ArrowPathIcon className="h-4 w-4" />
							Scan Another
						</button>
					</div>
				)}
			</div>
		</div>
	)
}

export default TicketScanner