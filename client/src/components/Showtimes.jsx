import { EyeSlashIcon } from '@heroicons/react/24/outline'
import { useContext } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from '../config/axiosConfig'
import { AuthContext } from '../context/AuthContext'
import TicketCountPrompt from './TicketCountPrompt'
import { getAvailabilityInfo } from '../utils/showtimeAvailability'

const Showtimes = ({ showtimes, movies, selectedDate, filterMovie, showMovieDetail = true, seatPlan }) => {
	const { auth } = useContext(AuthContext)
	const [ticketPrompt, setTicketPrompt] = useState(null)

	const navigate = useNavigate()
	const sortedShowtimes = showtimes?.reduce((result, showtime) => {
		const { movie, showtime: showDateTime, seats, _id, isRelease } = showtime

		if (filterMovie && filterMovie._id !== movie) {
			return result // skip
		}

		// Hide showtimes that have already started/finished from customers.
		// (Admins keep seeing them so they can still manage past showtimes.)
		if (auth.role !== 'admin' && new Date(showDateTime) < new Date()) {
			return result
		}

		if (
			new Date(showDateTime).getDate() === selectedDate.getDate() &&
			new Date(showDateTime).getMonth() === selectedDate.getMonth() &&
			new Date(showDateTime).getFullYear() === selectedDate.getFullYear()
		) {
			if (!result[movie]) {
				result[movie] = []
			}
			result[movie].push({ showtime: showDateTime, seats, _id, isRelease, availableSeats: showtime.availableSeats, totalSeats: showtime.totalSeats })
		}
		return result
	}, {})

	// Sort the showtimes array for each movie by showtime
	sortedShowtimes &&
		Object.values(sortedShowtimes).forEach((movie) => {
			movie.sort((a, b) => new Date(a.showtime) - new Date(b.showtime))
		})

	const isPast = (date) => {
		return date < new Date()
	}

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

	if (!Object.keys(sortedShowtimes).length) {
		return <p className="text-center">There are no showtimes available</p>
	}
	return (
		<>
			{ticketPrompt && (
				<TicketCountPrompt
					showtime={ticketPrompt.showtime}
					availability={ticketPrompt.availability}
					onClose={() => setTicketPrompt(null)}
					onContinue={(ticketCount) => {
						navigate(`/showtime/${ticketPrompt.showtime._id}`, { state: { ticketCount } })
						setTicketPrompt(null)
					}}
					onJoinWaitlist={() => {
						navigate(`/showtime/${ticketPrompt.showtime._id}`, { state: { openWaitlist: true } })
						setTicketPrompt(null)
					}}
					onContinueWithWaitlist={(availableCount, requestedCount) => {
						// Book available seats now, waitlist for the rest
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
			{movies?.map((movie, index) => {
				return (
					sortedShowtimes &&
					sortedShowtimes[movie._id] && (
						<div key={index} className="flex items-center">
							{showMovieDetail && <img src={movie.img} className="w-32 px-4 drop-shadow-md" />}
							<div className="mr-4 flex flex-col gap-2 pb-4 pt-2">
								{showMovieDetail && (
									<div>
										<h4 className="text-2xl font-semibold">{movie.name}</h4>
										<p className="text-md font-medium">length : {movie.length || '-'} min</p>
									</div>
								)}
								<div className="flex flex-wrap items-center gap-2 pt-1">
									{sortedShowtimes[movie._id]?.map((showtime, index) => {
										const availability = getAvailabilityInfo({
											seats: showtime.seats,
											seatPlan,
											availableSeats: showtime.availableSeats,
											totalSeats: showtime.totalSeats
										})
										return (
											<button
												key={index}
												title={`${new Date(showtime.showtime)
													.getHours()
													.toString()
													.padStart(2, '0')} : ${new Date(showtime.showtime)
													.getMinutes()
													.toString()
													.padStart(2, '0')} - ${new Date(
													new Date(showtime.showtime).getTime() + movie.length * 60000
												)
													.getHours()
													.toString()
													.padStart(2, '0')} : ${new Date(
													new Date(showtime.showtime).getTime() + movie.length * 60000
												)
													.getMinutes()
													.toString()
													.padStart(2, '0')}
												`}
												className={
													isPast(new Date(showtime.showtime))
														? `flex items-center gap-1 rounded-md bg-gradient-to-br from-gray-100 to-white px-2 py-1 text-lg text-gray-900 ring-1 ring-inset ring-gray-800 drop-shadow-sm ${
																auth.role !== 'admin' && 'cursor-not-allowed'
														  } ${
																auth.role === 'admin' &&
																'to-gray-100 hover:from-gray-200'
														  }`
														: new Date(showtime.showtime).getTime() ===
														  new Date(
																sortedShowtimes[movie._id].find(
																	(s) => new Date(s.showtime) > new Date()
																).showtime
														  ).getTime()
														? 'flex items-center gap-1 rounded-md bg-gradient-to-br from-indigo-600 to-blue-500 px-2 py-1 text-lg text-white drop-shadow-sm hover:from-indigo-500 hover:to-blue-400'
														: 'flex items-center gap-1 rounded-md bg-gradient-to-br from-gray-600 to-gray-500 px-2 py-1 text-lg text-white drop-shadow-sm hover:from-gray-500 hover:to-gray-400'
												}
												onClick={() => {
													if (!isPast(new Date(showtime.showtime)) || auth.role === 'admin')
														return openShowtime({ ...showtime, movie }, availability)
												}}
											>
												{!showtime.isRelease && (
													<EyeSlashIcon className="h-6 w-6" title="Unreleased showtime" />
												)}
												{`${new Date(showtime.showtime)
													.getHours()
													.toString()
													.padStart(2, '0')} : ${new Date(showtime.showtime)
													.getMinutes()
													.toString()
													.padStart(2, '0')}`}
												<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${availability.className}`}>
													{availability.label}
												</span>
											</button>
										)
									})}
								</div>
							</div>
						</div>
					)
				)
			})}
		</>
	)
}

export default Showtimes