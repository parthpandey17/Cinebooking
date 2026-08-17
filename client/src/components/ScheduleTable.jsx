import { ArrowsRightLeftIcon, ArrowsUpDownIcon, EyeSlashIcon, UserIcon } from '@heroicons/react/24/outline'
import { useContext, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from '../config/axiosConfig'
import { AuthContext } from '../context/AuthContext'
import TicketCountPrompt from './TicketCountPrompt'
import { getAvailabilityInfo } from '../utils/showtimeAvailability'
import { toast } from 'react-toastify'

const ScheduleTable = ({ cinema, selectedDate }) => {
	const { auth } = useContext(AuthContext)
	const navigate = useNavigate()
	const [ticketPrompt, setTicketPrompt] = useState(null)
	const [joiningWaitlist, setJoiningWaitlist] = useState(false)

	const pad = (n) => n.toString().padStart(2, '0')
	const fmt = (d) => `${pad(new Date(d).getHours())} : ${pad(new Date(d).getMinutes())}`
	const timeRange = (showtime) =>
		`${fmt(showtime.showtime)} - ${fmt(new Date(new Date(showtime.showtime).getTime() + showtime.movie.length * 60000))}`

	const isPast = (date) => date < new Date()

	function rowToNumber(column) {
		let result = 0
		for (let i = 0; i < column.length; i++) {
			const charCode = column.charCodeAt(i) - 64
			result = result * 26 + charCode
		}
		return result
	}

	// Showtimes for the selected day, sorted by start time.
	// Past (started/finished) showtimes are hidden from customers; admins keep them.
	const getTodayShowtimes = (theater) => {
		const now = new Date()
		return (theater.showtimes || [])
			.filter((showtime) => {
				if (auth.role !== 'admin' && new Date(showtime.showtime) < now) return false
				return (
					new Date(showtime.showtime).getDate() === selectedDate.getDate() &&
					new Date(showtime.showtime).getMonth() === selectedDate.getMonth() &&
					new Date(showtime.showtime).getYear() === selectedDate.getYear()
				)
			})
			.sort((a, b) => new Date(a.showtime) - new Date(b.showtime))
	}

	const totalCount = (cinema.theaters || []).reduce((sum, t) => sum + getTodayShowtimes(t).length, 0)

	// Always fetch live availability from backend when opening ticket prompt
	const openShowtime = async (showtime, availability) => {
		if (auth.role === 'admin') return navigate(`/showtime/${showtime._id}`)
		try {
			const response = await axios.get(`/showtime/${showtime._id}/availability`)
			setTicketPrompt({
				showtime,
				availability: { ...availability, available: response.data.data.availableSeats }
			})
		} catch {
			setTicketPrompt({ showtime, availability })
		}
	}

	const handleJoinWaitlist = async (requestedSeats = 1) => {
		setJoiningWaitlist(true)
		try {
			await axios.post(`/waitlist/${ticketPrompt.showtime._id}`, { seatsRequested: requestedSeats })
			setTicketPrompt(null)
			toast.success('You have been added to the waitlist.', {
				position: 'top-center',
				autoClose: 3000,
				pauseOnHover: false
			})
			navigate('/my-waitlists')
		} catch (err) {
			if (err?.response?.status === 401) {
				toast.error('Your session expired. Please log in again.', { position: 'top-center' })
				navigate('/login')
				return
			}
			const msg = err?.response?.data?.message || 'Could not join waitlist. Please try again.'
			toast.error(msg, { position: 'top-center', autoClose: 3000, pauseOnHover: false })
		} finally {
			setJoiningWaitlist(false)
		}
	}

	return (
		<>
			{ticketPrompt && (
				<TicketCountPrompt
					showtime={ticketPrompt.showtime}
					availability={ticketPrompt.availability}
					joiningWaitlist={joiningWaitlist}
					onClose={() => setTicketPrompt(null)}
					onContinue={(ticketCount) => {
						navigate(`/showtime/${ticketPrompt.showtime._id}`, { state: { ticketCount } })
						setTicketPrompt(null)
					}}
					onJoinWaitlist={(requestedSeats) => handleJoinWaitlist(requestedSeats)}
					onContinueWithWaitlist={(availableCount, requestedCount) => {
						navigate(`/showtime/${ticketPrompt.showtime._id}`, {
							state: {
								ticketCount: availableCount,
								waitlistSeats: requestedCount - availableCount
							}
						})
						setTicketPrompt(null)
					}}
				/>
			)}

			<div className="flex flex-col gap-4">
				{totalCount === 0 && (
					<div className="rounded-md bg-white py-10 text-center text-xl font-semibold text-gray-700 shadow">
						There are no showtimes available
					</div>
				)}

				{cinema.theaters?.map((theater, tIndex) => {
					const todays = getTodayShowtimes(theater)
					if (todays.length === 0) return null

					return (
						<div
							key={tIndex}
							className="overflow-hidden rounded-md bg-gradient-to-br from-indigo-100 to-white shadow"
						>
							{/* Theater header */}
							<div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-br from-gray-800 to-gray-700 px-4 py-2 text-white">
								<p className="text-lg font-semibold">Theater {theater.number ?? tIndex + 1}</p>
								{auth.role === 'admin' && (
									<div className="flex flex-wrap items-center gap-3 text-xs">
										<p className="flex items-center gap-1">
											<ArrowsUpDownIcon className="h-3 w-3" />
											{theater.seatPlan.row === 'A' ? theater.seatPlan.row : `A - ${theater.seatPlan.row}`}
										</p>
										<p className="flex items-center gap-1">
											<ArrowsRightLeftIcon className="h-3 w-3" />
											{theater.seatPlan.column === 1 ? theater.seatPlan.column : `1 - ${theater.seatPlan.column}`}
										</p>
										<p className="flex items-center gap-1">
											<UserIcon className="h-4 w-4" />
											{(rowToNumber(theater.seatPlan.row) * theater.seatPlan.column).toLocaleString('en-US')} Seats
										</p>
									</div>
								)}
							</div>

							{/* Horizontal, wrapping list of shows (BookMyShow style) */}
							<div className="flex flex-wrap gap-2 p-3">
								{todays.map((showtime, sIndex) => {
									const availability = getAvailabilityInfo({
										seats: showtime.seats,
										seatPlan: theater.seatPlan,
										availableSeats: showtime.availableSeats,
										totalSeats: showtime.totalSeats
									})
									const past = isPast(new Date(showtime.showtime))

									return (
										<button
											key={sIndex}
											title={`${showtime.movie.name}\n${timeRange(showtime)}`}
											onClick={() => {
												if (!past || auth.role === 'admin') return openShowtime(showtime, availability)
											}}
											className={`flex w-44 flex-col items-center gap-0.5 rounded-md p-2 text-center drop-shadow-md ${
												!past
													? 'bg-white hover:bg-gray-100'
													: `bg-gray-200 ${auth.role === 'admin' ? 'hover:bg-gray-300' : 'cursor-not-allowed'}`
											} ${!showtime.isRelease ? 'ring-2 ring-inset ring-gray-800' : ''}`}
										>
											{!showtime.isRelease && (
												<EyeSlashIcon className="h-5 w-5 stroke-2" title="Unreleased showtime" />
											)}
											<p className="text-sm font-bold leading-tight">{showtime.movie.name}</p>
											<p className="text-sm leading-tight">{timeRange(showtime)}</p>
											<span className={`mt-1 rounded-full px-2 py-0.5 text-xs font-bold ${availability.className}`}>
												{availability.label}
											</span>
										</button>
									)
								})}
							</div>
						</div>
					)
				})}
			</div>
		</>
	)
}

export default ScheduleTable