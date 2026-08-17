import { CheckIcon, LockClosedIcon } from '@heroicons/react/24/outline'
import { memo, useState } from 'react'

// seatStatus values: 'available' | 'booked' | 'locked' | 'myLock'
const Seat = ({ seat, setSelectedSeats, selectable, isAvailable, seatStatus }) => {
	const [isSelected, setIsSelected] = useState(false)

	const seatLabel = `${seat.row}${seat.number}`

	// Already booked by someone (permanently taken)
	if (!isAvailable) {
		return (
			<button
				title={`${seatLabel} — Booked`}
				className="flex h-8 w-8 cursor-not-allowed items-center justify-center"
			>
				<div className="h-6 w-6 rounded bg-gray-500 drop-shadow-md"></div>
			</button>
		)
	}

	// Locked by another user — show as amber/orange
	if (seatStatus === 'locked') {
		return (
			<button
				title={`${seatLabel} — Temporarily held by another user`}
				className="flex h-8 w-8 cursor-not-allowed items-center justify-center"
			>
				<div className="flex h-6 w-6 items-center justify-center rounded bg-amber-400 drop-shadow-md">
					<LockClosedIcon className="h-3.5 w-3.5 text-amber-900" />
				</div>
			</button>
		)
	}

	// Locked by the current user (part of their checkout session) — treat as selectable/selected
	// These will already be in selectedSeats coming from the Showtime page flow,
	// so we just render them the same as selected (blue) — the Showtime page
	// manages the selectedSeats array which pre-populates them.

	if (seatStatus === 'myLock' && !isSelected) {
		return (
			<button
				title={`${seatLabel} - Held for you`}
				className={`flex h-8 w-8 items-center justify-center ${!selectable && 'cursor-not-allowed'}`}
				onClick={() => {
					if (selectable) {
						setIsSelected(true)
						setSelectedSeats((prev) => [...prev, seatLabel])
					}
				}}
			>
				<div className="flex h-6 w-6 items-center justify-center rounded bg-sky-100 ring-2 ring-blue-500 drop-shadow-md">
					<LockClosedIcon className="h-3.5 w-3.5 text-blue-700" />
				</div>
			</button>
		)
	}

	// Selected by current user
	if (isSelected) {
		return (
			<button
				title={`${seatLabel} — Selected (click to deselect)`}
				className="flex h-8 w-8 items-center justify-center"
				onClick={() => {
					setIsSelected(false)
					setSelectedSeats((prev) => prev.filter((e) => e !== seatLabel))
				}}
			>
				<div className="flex h-6 w-6 items-center justify-center rounded bg-blue-500 drop-shadow-md">
					<CheckIcon className="h-5 w-5 stroke-[3] text-white" />
				</div>
			</button>
		)
	}

	// Available
	return (
		<button
			title={`${seatLabel} — Available`}
			className={`flex h-8 w-8 items-center justify-center ${!selectable && 'cursor-not-allowed'}`}
			onClick={() => {
				if (selectable) {
					setIsSelected(true)
					setSelectedSeats((prev) => [...prev, seatLabel])
				}
			}}
		>
			<div className="h-6 w-6 rounded bg-white drop-shadow-md"></div>
		</button>
	)
}

export default memo(Seat)
