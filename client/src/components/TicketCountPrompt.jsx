import { ExclamationCircleIcon, NoSymbolIcon, TicketIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { QueueListIcon } from '@heroicons/react/24/outline'
import { useState } from 'react'

/**
 * Ticket Count Prompt — shown before entering the seat map.
 *
 * Case C  available === 0  → Sold out → offer waitlist
 * Case A  requestedCount <= available → proceed normally
 * Case B  requestedCount > available  → show partial dialog
 *
 * BUG 1 FIX:
 *   onJoinWaitlist is now called with (requestedCount) so the caller
 *   knows how many seats to request on the waitlist.
 *   The caller (ScheduleTable) handles the API call and redirect to
 *   /my-waitlists — this component no longer navigates anywhere itself.
 */
const TicketCountPrompt = ({
	showtime,
	availability,
	onClose,
	onContinue,
	onJoinWaitlist,
	onContinueWithWaitlist,
	joiningWaitlist = false
}) => {
	const available = Math.max(0, availability?.available ?? 0)
	const [requestedCount, setRequestedCount] = useState(1)
	const [showPartialDialog, setShowPartialDialog] = useState(false)

	// ── Case C: Sold out ──────────────────────────────────────────────────────
	if (available === 0) {
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
				<div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-center gap-2">
							<NoSymbolIcon className="h-6 w-6 text-red-500" />
							<h3 className="text-lg font-bold text-red-700">Sold Out</h3>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						>
							<XMarkIcon className="h-5 w-5" />
						</button>
					</div>
					<p className="mt-3 text-sm text-gray-600">
						This show is currently sold out. Join the waitlist to be notified when a seat becomes available.
					</p>

					{/* Seat count picker for waitlist */}
					<label className="mt-4 flex items-center justify-between gap-3 text-sm font-semibold text-gray-700">
						<span>How many seats?</span>
						<input
							type="number"
							min="1"
							value={requestedCount}
							onChange={(e) => {
								const v = parseInt(e.target.value, 10)
								setRequestedCount(Number.isNaN(v) || v < 1 ? 1 : v)
							}}
							className="w-24 rounded-md border border-indigo-200 px-2 py-2 text-center text-lg font-bold text-indigo-900"
						/>
					</label>

					<div className="mt-5 flex justify-end gap-2">
						<button
							type="button"
							onClick={onClose}
							className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
						>
							Cancel
						</button>
						<button
							type="button"
							disabled={joiningWaitlist}
							onClick={() => onJoinWaitlist?.(requestedCount)}
							className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
						>
							{joiningWaitlist ? (
								'Joining...'
							) : (
								<>
									<QueueListIcon className="h-4 w-4" />
									Join Waitlist
								</>
							)}
						</button>
					</div>
				</div>
			</div>
		)
	}

	// ── Case B: Partial availability dialog ───────────────────────────────────
	if (showPartialDialog) {
		const remaining = requestedCount - available
		return (
			<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
				<div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
					<div className="flex items-start justify-between gap-4">
						<div className="flex items-center gap-2">
							<ExclamationCircleIcon className="h-6 w-6 text-amber-500" />
							<h3 className="text-lg font-bold text-amber-700">Limited Seats</h3>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
						>
							<XMarkIcon className="h-5 w-5" />
						</button>
					</div>

					<p className="mt-3 text-sm text-gray-700">
						Only <strong>{available}</strong> seat{available !== 1 ? 's are' : ' is'} currently
						available. You originally requested <strong>{requestedCount}</strong> seat{requestedCount !== 1 ? 's' : ''}.
					</p>
					<p className="mt-1 text-sm text-gray-600">
						Would you like to join the waitlist for the remaining <strong>{remaining}</strong> seat{remaining !== 1 ? 's' : ''}?
					</p>

					<div className="mt-5 flex flex-col gap-2">
						<button
							type="button"
							onClick={() => {
								setShowPartialDialog(false)
								onContinue(available)
							}}
							className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
						>
							<TicketIcon className="h-4 w-4" />
							Continue with {available} Seat{available !== 1 ? 's' : ''} Only
						</button>
						{onContinueWithWaitlist && (
							<button
								type="button"
								onClick={() => {
									setShowPartialDialog(false)
									onContinueWithWaitlist(available, requestedCount)
								}}
								className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500"
							>
								<TicketIcon className="h-4 w-4" />
								Continue with {available} + Join Waitlist for {remaining}
							</button>
						)}
						<button
							type="button"
							onClick={onClose}
							className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200"
						>
							Cancel — Return to Showtime
						</button>
					</div>
				</div>
			</div>
		)
	}

	// ── Case A: Normal ticket count picker ────────────────────────────────────
	const isOver    = requestedCount > available
	const isInvalid = requestedCount < 1

	const handleContinue = () => {
		if (isInvalid) return
		// BUG 2 FIX: always forward the ORIGINAL requested count to the seat map.
		// The seat map recomputes the required count from LIVE availability and
		// presents the partial-booking choices there, so availability changes
		// between this prompt and the seat map are handled correctly instead of
		// being frozen at prompt time.
		onContinue(requestedCount)
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
			<div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 className="text-lg font-bold text-indigo-900">Select Tickets</h3>
						<p className="mt-0.5 text-sm text-gray-600">
							{showtime?.movie?.name || 'Showtime'}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
					>
						<XMarkIcon className="h-5 w-5" />
					</button>
				</div>

				<div className="mt-4 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800">
					{available} seat{available !== 1 ? 's' : ''} currently available
				</div>

				<label className="mt-4 flex items-center justify-between gap-3 text-sm font-semibold text-gray-700">
					<span>How many tickets?</span>
					<input
						type="number"
						min="1"
						value={requestedCount}
						onChange={(e) => {
							const v = parseInt(e.target.value, 10)
							setRequestedCount(Number.isNaN(v) || v < 1 ? 1 : v)
						}}
						className={`w-24 rounded-md border px-2 py-2 text-center text-lg font-bold ${
							isOver
								? 'border-amber-400 bg-amber-50 text-amber-800'
								: 'border-indigo-200 text-indigo-900'
						}`}
					/>
				</label>

				{isOver && (
					<p className="mt-2 flex items-center gap-1 text-sm font-medium text-amber-700">
						<ExclamationCircleIcon className="h-4 w-4 shrink-0" />
						Only {available} seat{available !== 1 ? 's' : ''} available — you may book {available} now and join the waitlist for the rest.
					</p>
				)}

				<div className="mt-5 flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleContinue}
						disabled={isInvalid}
						className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-400"
					>
						<TicketIcon className="h-4 w-4" />
						Continue
					</button>
				</div>
			</div>
		</div>
	)
}

export default TicketCountPrompt