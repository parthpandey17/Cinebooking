export const rowToNumber = (row = '') =>
	String(row)
		.split('')
		.reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0)

export const getSeatCapacity = (seatPlan) => rowToNumber(seatPlan?.row) * Number(seatPlan?.column || 0)

export const getAvailabilityInfo = ({ seats = [], seatPlan, availableSeats, totalSeats }) => {
	const capacity = getSeatCapacity(seatPlan)
	const resolvedCapacity = Number(totalSeats ?? capacity)
	const booked = seats.length || 0
	const available = Number.isFinite(Number(availableSeats))
		? Math.max(0, Number(availableSeats))
		: Math.max(0, resolvedCapacity - booked)
	const ratio = resolvedCapacity ? (resolvedCapacity - available) / resolvedCapacity : 0

	if (!resolvedCapacity) {
		return {
			available,
			booked,
			capacity: resolvedCapacity,
			label: 'Seats unavailable',
			className: 'bg-gray-100 text-gray-600'
		}
	}

	if (available === 0) {
		return {
			available,
			booked,
			capacity: resolvedCapacity,
			label: 'Completely filled',
			className: 'bg-red-100 text-red-700'
		}
	}

	if (ratio >= 0.75) {
		return {
			available,
			booked,
			capacity: resolvedCapacity,
			label: 'Filling fast',
			className: 'bg-amber-100 text-amber-700'
		}
	}

	return {
		available,
		booked,
		capacity: resolvedCapacity,
		label: 'Seats available',
		className: 'bg-green-100 text-green-700'
	}
}
