import { TicketIcon, ClockIcon, CheckCircleIcon, XCircleIcon, QrCodeIcon } from '@heroicons/react/24/solid'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import axios from '../config/axiosConfig'
import { useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import Navbar from '../components/Navbar'
import ShowtimeDetails from '../components/ShowtimeDetails'
import { AuthContext } from '../context/AuthContext'

const LOCK_DURATION_SECONDS = 5 * 60 // 5 minutes
const PRICE_PER_SEAT = 250 // INR

const loadRazorpayScript = () =>
	new Promise((resolve) => {
		if (window.Razorpay) return resolve(true)
		const script = document.createElement('script')
		script.src = 'https://checkout.razorpay.com/v1/checkout.js'
		script.onload = () => resolve(true)
		script.onerror = () => resolve(false)
		document.body.appendChild(script)
	})

const Purchase = () => {
	const navigate = useNavigate()
	const { auth } = useContext(AuthContext)
	const location = useLocation()
	const showtime = location.state?.showtime
	const selectedSeats = location.state?.selectedSeats || []
	// BUG 1 (Option 1): seats still wanted after booking the available ones.
	// When > 0, we join the waitlist for this many seats after payment succeeds.
	const waitlistRemainder = Number(location.state?.waitlistRemainder || 0)

	const [isPurchasing, setIsPurchasing] = useState(false)
	const [secondsLeft, setSecondsLeft] = useState(LOCK_DURATION_SECONDS)
	const [lockExpired, setLockExpired] = useState(false)
	const [paymentState, setPaymentState] = useState('idle') // 'idle' | 'processing' | 'failed' | 'success'
	const [ticketData, setTicketData] = useState(null)

	const timerRef = useRef(null)
	const verifyRef = useRef(null)

	// Prevents React 18 Strict Mode double-invoke of initLockTimer
	const hasMounted = useRef(false)

	// Prevents unlock cleanup from firing after successful payment
	const paymentSucceeded = useRef(false)
	const lockReleaseRequested = useRef(false)
	// True only after the initial server lock-verify resolves. Used to gate the
	// unmount/pagehide release so React 18 Strict Mode's dev-only remount (whose
	// cleanup fires BEFORE this async verify resolves) does not delete a fresh lock.
	const lockEstablished = useRef(false)
	// Timestamp of mount. The lock is created on the seat map BEFORE this page
	// loads, so on a real navigation away we should release even if the on-mount
	// verify hasn't resolved yet. React 18 Strict Mode's throwaway unmount happens
	// within the same tick (<<1s) of mount, so a small elapsed-time threshold
	// distinguishes a genuine user exit from the dev remount.
	const mountedAtRef = useRef(Date.now())

	const totalAmount = selectedSeats.length * PRICE_PER_SEAT

	const releaseLocks = async () => {
		if (!showtime?._id || lockReleaseRequested.current || paymentSucceeded.current) return
		lockReleaseRequested.current = true
		try {
			await axios.delete('/seatlock/unlock', {
				data: { showtimeId: showtime._id },
				headers: { Authorization: `Bearer ${auth.token}` }
			})
		} catch (_) {
			lockReleaseRequested.current = false
		}
	}

	// Guard: redirect home if user visited /purchase directly with no state
	useEffect(() => {
		if (!showtime || !selectedSeats.length) {
			navigate('/', { replace: true })
		}
	}, [])

	// On mount: verify lock is valid and sync countdown with server's expiresAt
	useEffect(() => {
		if (!showtime || !selectedSeats.length) return

		// Skip the second invocation caused by React 18 Strict Mode
		if (hasMounted.current) return
		hasMounted.current = true

		const initLockTimer = async () => {
			try {
				const response = await axios.post(
					'/seatlock/verify',
					{ showtimeId: showtime._id, seats: selectedSeats },
					{ headers: { Authorization: `Bearer ${auth.token}` } }
				)
				const expiresAt = new Date(response.data.data.expiresAt)
				const now = new Date()
				const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000))
				setSecondsLeft(remaining)
				lockEstablished.current = remaining > 0
				if (remaining === 0) setLockExpired(true)
			} catch (err) {
				console.warn('Seat lock verify failed:', err?.response?.data?.message || err.message)
				setLockExpired(true)
				setSecondsLeft(0)
			}
		}

		initLockTimer()
	}, [])

	// Countdown ticker
	useEffect(() => {
		if (lockExpired) return

		timerRef.current = setInterval(() => {
			setSecondsLeft((prev) => {
				if (prev <= 1) {
					clearInterval(timerRef.current)
					setLockExpired(true)
					releaseLocks()
					return 0
				}
				return prev - 1
			})
		}, 1000)

		return () => clearInterval(timerRef.current)
	}, [lockExpired])

	// Re-verify with server every 60 s to catch clock skew / external expiry
	useEffect(() => {
		if (!showtime || !selectedSeats.length || lockExpired) return

		verifyRef.current = setInterval(async () => {
			try {
				await axios.post(
					'/seatlock/verify',
					{ showtimeId: showtime._id, seats: selectedSeats },
					{ headers: { Authorization: `Bearer ${auth.token}` } }
				)
			} catch {
				clearInterval(verifyRef.current)
				setLockExpired(true)
				setSecondsLeft(0)
			}
		}, 60000)

		return () => clearInterval(verifyRef.current)
	}, [lockExpired])

	// ── Release seat locks when the user abandons checkout ────────────────────
	// FIX: previously locks were only released by the in-app Back button, the
	// Razorpay dismiss handler, or the 5-minute TTL. Leaving the payment page by
	// browser-back, a navbar link, refresh, or closing the tab left the seats
	// held for the full TTL — so other users saw them as unavailable and the
	// owner saw them stuck as held. We now release on unmount and on page hide.
	//
	// The Strict Mode hazard the original code worried about is avoided by gating
	// on `lockEstablished` (set only after the async verify resolves). In dev,
	// Strict Mode's throwaway cleanup runs before verify resolves, so it sees
	// lockEstablished=false and does NOT release. In production (single mount) and
	// for real navigations, verify has resolved, so the release fires correctly.
	useEffect(() => {
		// Best-effort release on tab close / refresh / hard navigation. Uses
		// fetch keepalive so the request survives the page unload.
		const shouldRelease = () =>
			!!showtime?._id &&
			!!auth.token &&
			!paymentSucceeded.current &&
			!lockReleaseRequested.current &&
			(lockEstablished.current || Date.now() - mountedAtRef.current > 800)

		const releaseOnUnload = () => {
			if (!shouldRelease()) return
			lockReleaseRequested.current = true
			try {
				fetch(`${axios.defaults.baseURL || ''}/seatlock/unlock`, {
					method: 'DELETE',
					keepalive: true,
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${auth.token}`
					},
					body: JSON.stringify({ showtimeId: showtime._id })
				})
			} catch (_) {
				lockReleaseRequested.current = false
			}
		}

		window.addEventListener('pagehide', releaseOnUnload)
		window.addEventListener('beforeunload', releaseOnUnload)

		return () => {
			window.removeEventListener('pagehide', releaseOnUnload)
			window.removeEventListener('beforeunload', releaseOnUnload)
			// SPA navigation away (browser back, navbar, Re-select Seats, etc.):
			// release via axios. The lock was created on the seat map before this
			// page mounted, so release on any genuine exit (established OR >800ms
			// since mount — the latter skips React Strict Mode's instant remount).
			if (shouldRelease()) {
				releaseLocks()
			}
		}
	}, [])

	const formatTime = (secs) => {
		const m = Math.floor(secs / 60)
		const s = secs % 60
		return `${m}:${String(s).padStart(2, '0')}`
	}

	const timerColor = () => {
		if (secondsLeft > 120) return 'text-green-600'
		if (secondsLeft > 60) return 'text-amber-500'
		return 'text-red-600'
	}

	const onPurchase = async () => {
		setIsPurchasing(true)
		setPaymentState('processing')

		try {
			const sdkLoaded = await loadRazorpayScript()
			if (!sdkLoaded) {
				toast.error('Failed to load payment SDK. Check your internet connection.', {
					position: 'top-center',
					autoClose: 3000
				})
				setPaymentState('idle')
				setIsPurchasing(false)
				return
			}

			// FIX: Verify lock is still valid before creating order.
			// This avoids the round-trip to create-order only to fail
			// on an expired lock, which wastes a Razorpay order slot.
			try {
				await axios.post(
					'/seatlock/verify',
					{ showtimeId: showtime._id, seats: selectedSeats },
					{ headers: { Authorization: `Bearer ${auth.token}` } }
				)
			} catch (verifyErr) {
				const msg = verifyErr?.response?.data?.message || 'Your seat reservation has expired. Please re-select.'
				toast.error(msg, { position: 'top-center', autoClose: 3000 })
				setLockExpired(true)
				setSecondsLeft(0)
				setPaymentState('idle')
				setIsPurchasing(false)
				return
			}

			const orderRes = await axios.post(
				'/payment/create-order',
				{ showtimeId: showtime._id, seats: selectedSeats },
				{ headers: { Authorization: `Bearer ${auth.token}` } }
			)

			if (!orderRes.data.success) {
				throw new Error(orderRes.data.message || 'Failed to create order')
			}

			const { orderId, amount, currency, keyId } = orderRes.data.data

			// FIX: Wrap Razorpay in a Promise so we can properly await it and
			// reset isPurchasing in all exit paths (success, cancel, failure).
			await new Promise((resolve, reject) => {
				const options = {
					key: keyId,
					amount,
					currency,
					name: 'CineBooker',
					description: `${selectedSeats.length} seat(s) — ${showtime.movie?.name || 'Movie'}`,
					order_id: orderId,
					prefill: {
						name: auth.username || '',
						email: auth.email || ''
					},
					theme: { color: '#4338CA' },
					modal: {
						// FIX: escape=false keeps the Razorpay modal open when the
						// user presses Escape, preventing accidental dismissals.
						// Remove this line if you prefer ESC to dismiss.
						escape: false,
						ondismiss: async () => {
							try {
								await axios.post(
									'/payment/cancel',
									{ orderId },
									{ headers: { Authorization: `Bearer ${auth.token}` } }
								)
							} catch (_) {}
							reject(new Error('CANCELLED'))
						}
					},
					handler: async (response) => {
						try {
							const verifyRes = await axios.post(
								'/payment/verify',
								{
									razorpay_order_id: response.razorpay_order_id,
									razorpay_payment_id: response.razorpay_payment_id,
									razorpay_signature: response.razorpay_signature
								},
								{ headers: { Authorization: `Bearer ${auth.token}` } }
							)
							if (verifyRes.data.success) {
								resolve(verifyRes.data.data)
							} else {
								reject(new Error(verifyRes.data.message || 'Payment verification failed'))
							}
						} catch (err) {
							reject(err)
						}
					}
				}

				const rzp = new window.Razorpay(options)

				rzp.on('payment.failed', async (response) => {
					console.error('Razorpay payment.failed event:', response.error)
					// FIX: Don't cancel the order here — the ondismiss handler will
					// also fire after payment.failed on some Razorpay versions and
					// double-cancelling causes a 404 which logs as an error.
					// The backend treats a 'created' status as cancellable anyway.
					reject(new Error(response.error?.description || 'Payment failed'))
				})

				rzp.open()
			})
				.then((ticket) => {
					// Set flag FIRST — prevents the unlock cleanup from firing
					paymentSucceeded.current = true
					clearInterval(timerRef.current)
					clearInterval(verifyRef.current)
					setTicketData(ticket)
					setPaymentState('success')
					// FIX: reset isPurchasing on success too
					setIsPurchasing(false)
					toast.success('Booking confirmed! 🎉', {
						position: 'top-center',
						autoClose: 3000,
						pauseOnHover: false
					})

					// BUG 1 (Option 1): book-and-stay — now that the available seats
					// are booked, join the waitlist for the outstanding balance. The
					// entry the user just paid against carried no waitlist row, so
					// this creates a fresh one for exactly the remaining seats. Later
					// the user is offered only those remaining seats.
					if (waitlistRemainder > 0 && showtime?._id) {
						axios
							.post(
								`/waitlist/${showtime._id}`,
								{ seatsRequested: waitlistRemainder },
								{ headers: { Authorization: `Bearer ${auth.token}` } }
							)
							.then(() => {
								toast.info(
									`You're on the waitlist for ${waitlistRemainder} more seat${waitlistRemainder !== 1 ? 's' : ''}.`,
									{ position: 'top-center', autoClose: 3500, pauseOnHover: false }
								)
							})
							.catch((err) => {
								toast.error(
									err?.response?.data?.message || 'Booked, but could not join the waitlist for the remaining seats.',
									{ position: 'top-center', autoClose: 4000 }
								)
							})
					}
				})
				.catch((err) => {
					// FIX: always reset isPurchasing so the button becomes clickable again
					setIsPurchasing(false)
					if (err.message === 'CANCELLED') {
						setPaymentState('idle')
						toast.info('Payment cancelled', {
							position: 'top-center',
							autoClose: 2000,
							pauseOnHover: false
						})
					} else {
						setPaymentState('failed')
						toast.error(err.message || 'Payment failed. Please try again.', {
							position: 'top-center',
							autoClose: 3000,
							pauseOnHover: false
						})
					}
				})
		} catch (error) {
			console.error('Purchase error:', error)
			const msg = error?.response?.data?.message || error.message || 'Something went wrong'
			setPaymentState('failed')
			setIsPurchasing(false)
			toast.error(msg, { position: 'top-center', autoClose: 3000, pauseOnHover: false })
			if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('lock')) {
				setLockExpired(true)
				setSecondsLeft(0)
				setTimeout(() => navigate(`/showtime/${showtime._id}`), 2500)
			}
		}
		// FIX: removed `finally { setIsPurchasing(false) }` — that reset isPurchasing
		// immediately after rzp.open() returned (before the user finished paying)
		// because open() is non-blocking. isPurchasing is now reset in .then()/.catch().
	}

	const handleGoBack = async () => {
		await releaseLocks()
		// Preserve the original requested count (and waitlist flag) so the seat map
		// lets the user re-select the same number of seats. Without this, the seat
		// map fell back to ticketCount = 1 and only one seat could be picked.
		navigate(`/showtime/${showtime._id}`, {
			state: {
				ticketCount:
					location.state?.originalRequested ||
					location.state?.ticketCount ||
					selectedSeats.length ||
					1,
				isWaitlistBooking: location.state?.isWaitlistBooking || false
			}
		})
	}

	// ── Success screen ──────────────────────────────────────────────────────
	if (paymentState === 'success' && ticketData) {
		return (
			<div className="flex min-h-screen flex-col gap-4 bg-gradient-to-br from-indigo-900 to-blue-500 pb-8 sm:gap-8">
				<Navbar />
				<div className="mx-4 h-fit rounded-lg bg-gradient-to-br from-indigo-200 to-blue-100 p-4 drop-shadow-xl sm:mx-8 sm:p-6">
					<div className="mb-6 flex flex-col items-center gap-3 rounded-lg bg-gradient-to-br from-green-100 to-emerald-50 p-6 text-center shadow-inner">
						<CheckCircleIcon className="h-16 w-16 text-green-500" />
						<h2 className="text-2xl font-bold text-green-700">Booking Confirmed!</h2>
						<p className="text-gray-600">Your seats have been reserved successfully.</p>
					</div>

					<div className="rounded-lg border-2 border-dashed border-indigo-300 bg-white p-4 shadow">
						<div className="mb-4 flex items-center justify-between border-b border-indigo-100 pb-3">
							<h3 className="text-lg font-bold text-indigo-700">🎟 Your Ticket</h3>
							<span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
								{ticketData.ticketId}
							</span>
						</div>

						<ShowtimeDetails showtime={ticketData.showtime} />

						<div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
							{/* Ticket info */}
							<div className="flex flex-1 flex-col gap-3">
								<div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
									<div className="rounded-md bg-indigo-50 p-3">
										<p className="font-semibold text-indigo-600">Seats</p>
										<p className="mt-1 font-bold">{ticketData.seats.join(', ')}</p>
									</div>
									<div className="rounded-md bg-indigo-50 p-3">
										<p className="font-semibold text-indigo-600">Amount Paid</p>
										<p className="mt-1 font-bold">₹{ticketData.amount}</p>
									</div>
									<div className="col-span-2 rounded-md bg-indigo-50 p-3 sm:col-span-1">
										<p className="font-semibold text-indigo-600">Payment ID</p>
										<p className="mt-1 break-all font-mono text-xs">{ticketData.razorpayPaymentId}</p>
									</div>
								</div>
							</div>

							{/* QR Code */}
							{ticketData.qrCodeDataUrl && (
								<div className="flex flex-col items-center gap-2 rounded-xl bg-indigo-50 p-4">
									<img
										src={ticketData.qrCodeDataUrl}
										alt="Ticket QR Code"
										className="h-36 w-36 rounded-lg"
									/>
									<p className="text-xs text-gray-500">Show at venue</p>
								</div>
							)}
						</div>
					</div>

					<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
						<button
							onClick={() => navigate(`/ticket/${ticketData.ticketId}`)}
							className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500 px-6 py-2 font-semibold text-white hover:from-indigo-500 hover:to-blue-500"
						>
							<QrCodeIcon className="h-5 w-5" />
							View &amp; Download Ticket
						</button>
						<button
							onClick={() => navigate('/ticket')}
							className="flex items-center justify-center gap-2 rounded-lg border-2 border-indigo-400 px-6 py-2 font-semibold text-indigo-700 hover:bg-indigo-50"
						>
							<TicketIcon className="h-5 w-5" />
							My Tickets
						</button>
						<button
							onClick={() => navigate('/cinema')}
							className="rounded-lg border-2 border-indigo-400 px-6 py-2 font-semibold text-indigo-700 hover:bg-indigo-50"
						>
							Browse More Shows
						</button>
					</div>
				</div>
			</div>
		)
	}

	// ── Checkout screen ─────────────────────────────────────────────────────
	return (
		<div className="flex min-h-screen flex-col gap-4 bg-gradient-to-br from-indigo-900 to-blue-500 pb-8 sm:gap-8">
			<Navbar />
			<div className="mx-4 h-fit rounded-lg bg-gradient-to-br from-indigo-200 to-blue-100 p-4 drop-shadow-xl sm:mx-8 sm:p-6">
				<ShowtimeDetails showtime={showtime} />

				{/* Lock countdown banner */}
				<div
					className={`mt-3 flex items-center justify-between rounded-lg px-4 py-2 font-semibold ${
						lockExpired
							? 'bg-red-100 text-red-700'
							: secondsLeft <= 60
							? 'bg-amber-50 text-amber-700'
							: 'bg-green-50 text-green-700'
					}`}
				>
					<div className="flex items-center gap-2">
						{lockExpired ? (
							<ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
						) : (
							<ClockIcon className={`h-5 w-5 ${timerColor()}`} />
						)}
						<span>
							{lockExpired
								? 'Your seat reservation has expired. Please go back and re-select.'
								: 'Seats reserved for: '}
						</span>
					</div>
					{!lockExpired && (
						<span className={`text-xl font-bold tabular-nums ${timerColor()}`}>
							{formatTime(secondsLeft)}
						</span>
					)}
				</div>

				{/* Payment failed banner */}
				{paymentState === 'failed' && (
					<div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-red-700">
						<XCircleIcon className="h-5 w-5 shrink-0" />
						<p className="text-sm font-medium">
							Payment failed. Your seats are still reserved — please try again before the timer runs out.
						</p>
					</div>
				)}

				{/* Order summary */}
				<div className="mt-3 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm">
					<h3 className="mb-3 text-base font-bold text-indigo-700">Order Summary</h3>
					<div className="flex flex-col gap-2 text-sm">
						<div className="flex justify-between">
							<span className="text-gray-600">Seats</span>
							<span className="font-semibold">{selectedSeats.join(', ')}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-gray-600">Price per seat</span>
							<span className="font-semibold">₹{PRICE_PER_SEAT}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-gray-600">Quantity</span>
							<span className="font-semibold">{selectedSeats.length} seat(s)</span>
						</div>
						<div className="mt-2 flex justify-between border-t border-indigo-100 pt-2">
							<span className="text-base font-bold text-indigo-700">Total</span>
							<span className="text-base font-bold text-indigo-700">₹{totalAmount}</span>
						</div>
					</div>
				</div>

				{/* Action bar */}
				<div className="mt-3 flex flex-col justify-between rounded-b-lg bg-gradient-to-br from-indigo-100 to-white text-center text-lg drop-shadow-lg md:flex-row">
					<div className="flex flex-col items-center gap-x-4 px-4 py-2 md:flex-row">
						<p className="font-semibold">Selected Seats : </p>
						<p className="text-start">{selectedSeats.join(', ')}</p>
						{!!selectedSeats.length && (
							<p className="whitespace-nowrap">({selectedSeats.length} seats)</p>
						)}
					</div>

					<div className="flex">
						<button
							onClick={handleGoBack}
							className="flex items-center justify-center gap-2 bg-gradient-to-br from-gray-500 to-gray-400 px-4 py-1 font-semibold text-white hover:from-gray-400 hover:to-gray-300"
						>
							← Back
						</button>

						{!!selectedSeats.length && !lockExpired && (
							<button
								onClick={onPurchase}
								disabled={isPurchasing || lockExpired}
								className="flex items-center justify-center gap-2 rounded-b-lg bg-gradient-to-br from-indigo-600 to-blue-500 px-4 py-1 font-semibold text-white hover:from-indigo-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:from-slate-500 disabled:to-slate-400 md:rounded-none md:rounded-br-lg"
							>
								{isPurchasing ? (
									<>
										<svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
											<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
											<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
										</svg>
										Processing...
									</>
								) : (
									<>
										<p>{paymentState === 'failed' ? 'Retry Payment' : `Pay ₹${totalAmount}`}</p>
										<TicketIcon className="h-7 w-7 text-white" />
									</>
								)}
							</button>
						)}

						{lockExpired && (
							<button
								onClick={handleGoBack}
								className="flex items-center justify-center gap-2 rounded-b-lg bg-red-500 px-4 py-1 font-semibold text-white hover:bg-red-400 md:rounded-none md:rounded-br-lg"
							>
								Re-select Seats
							</button>
						)}
					</div>
				</div>

				<p className="mt-3 text-center text-xs text-gray-500">
					🔒 Payments secured by Razorpay &nbsp;·&nbsp; Booking confirmed only after successful payment
				</p>
			</div>
		</div>
	)
}

export default Purchase