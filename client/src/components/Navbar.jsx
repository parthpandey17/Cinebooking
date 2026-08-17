import {
	ChartBarSquareIcon,
	ClockIcon,
	FilmIcon,
	HomeModernIcon,
	QrCodeIcon,
	QueueListIcon,
	TicketIcon
} from '@heroicons/react/24/outline'
import { Bars3Icon } from '@heroicons/react/24/solid'
import axios from '../config/axiosConfig'
import { useContext, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { AuthContext } from '../context/AuthContext'

const Navbar = () => {
	const { auth, setAuth } = useContext(AuthContext)
	const [menuOpen, setMenuOpen] = useState(false)
	const [isLoggingOut, SetLoggingOut] = useState(false)
	const navigate = useNavigate()

	const onLogout = async () => {
		try {
			SetLoggingOut(true)
			await axios.get('/auth/logout')
			setAuth({ username: null, email: null, role: null, token: null })
			sessionStorage.clear()
			navigate('/')
			toast.success('Logout successful!', { position: 'top-center', autoClose: 2000, pauseOnHover: false })
		} catch (error) {
			console.error(error)
			toast.error('Error', { position: 'top-center', autoClose: 2000, pauseOnHover: false })
		} finally {
			SetLoggingOut(false)
		}
	}

	const navLink = (to, icon, label) => (
		<Link
			to={to}
			className={`flex items-center justify-center gap-2 rounded-md px-2 py-1 text-white hover:bg-gray-500 ${
				window.location.pathname === to ? 'bg-gradient-to-br from-indigo-800 to-blue-700' : 'bg-gray-600'
			}`}
		>
			{icon}
			<p>{label}</p>
		</Link>
	)

	const menuLists = () => (
		<>
			<div className="flex flex-col gap-2 lg:flex-row">
				{navLink('/cinema',   <HomeModernIcon className="h-6 w-6" />, 'Cinema')}
				{navLink('/schedule', <ClockIcon      className="h-6 w-6" />, 'Schedule')}

				{/* User-only links */}
				{auth.role === 'user' && (
					<>
						{navLink('/ticket',       <TicketIcon    className="h-6 w-6" />, 'Ticket')}
						{navLink('/my-waitlists', <QueueListIcon className="h-6 w-6" />, 'My Waitlists')}
					</>
				)}

				{/* Admin-only links */}
				{auth.role === 'admin' && (
					<>
						{navLink('/admin',         <ChartBarSquareIcon className="h-6 w-6" />, 'Dashboard')}
						{navLink('/admin/scanner', <QrCodeIcon         className="h-6 w-6" />, 'Scanner')}
					</>
				)}
			</div>
			<div className="flex grow items-center justify-center gap-3 lg:justify-end">
				{auth.username && (
					<p className="text-md whitespace-nowrap leading-none text-white">Welcome {auth.username}!</p>
				)}
				{auth.id ? (
					<button
						className="rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500 px-2 py-1 text-white drop-shadow-md hover:from-indigo-500 hover:to-blue-400 disabled:from-slate-500 disabled:to-slate-400"
						onClick={onLogout}
						disabled={isLoggingOut}
					>
						{isLoggingOut ? 'Processing...' : 'Logout'}
					</button>
				) : (
					<button className="rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500 px-2 py-1 text-white drop-shadow-md hover:from-indigo-500 hover:to-blue-400">
						<Link to="/login">Login</Link>
					</button>
				)}
			</div>
		</>
	)

	return (
		<nav className="flex flex-col items-center justify-between gap-2 bg-gray-900 px-4 py-3 drop-shadow-lg lg:flex-row lg:justify-start sm:px-8">
			<div className="flex w-full flex-row justify-between lg:w-fit">
				<button className="flex flex-row items-center gap-2" onClick={() => navigate('/')}>
					<FilmIcon className="h-8 w-8 text-white" />
					<h1 className="mr-2 text-xl text-white">Cinema</h1>
				</button>
				<button
					className="flex h-8 w-8 items-center justify-center rounded hover:bg-gray-700 lg:hidden"
					onClick={() => setMenuOpen(!menuOpen)}
				>
					<Bars3Icon className="h-6 w-6 text-white" />
				</button>
			</div>
			<div className="hidden grow justify-between gap-2 lg:flex">{menuLists()}</div>
			{menuOpen && <div className="flex w-full grow flex-col gap-2 lg:hidden">{menuLists()}</div>}
		</nav>
	)
}

export default Navbar