import {
	ArrowPathIcon,
	BanknotesIcon,
	BuildingLibraryIcon,
	ChartBarIcon,
	ClockIcon,
	FilmIcon,
	LockClosedIcon,
	MagnifyingGlassIcon,
	TicketIcon,
	TrashIcon,
	UsersIcon,
	VideoCameraIcon,
	ExclamationTriangleIcon,
	CheckCircleIcon,
	XCircleIcon
} from '@heroicons/react/24/outline'
import axios from '../config/axiosConfig'
import { useContext, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import Navbar from '../components/Navbar'
import { AuthContext } from '../context/AuthContext'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => new Intl.NumberFormat('en-IN').format(n)
const rowToNumber = (row = '') => row.split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0)
const fmtCurrency = (n) => `₹${fmt(n)}`
const fmtDate = (d) =>
	d
		? new Date(d).toLocaleString('en-IN', {
				dateStyle: 'medium',
				timeStyle: 'short'
		  })
		: '—'

const TABS = ['Overview', 'Payments', 'Seat Locks', 'Waitlists', 'Email Logs', 'Showtimes', 'Users', 'Movies', 'Cinemas & Theaters']

const statusBadge = (status) => {
	const map = {
		paid:      'bg-green-100 text-green-700',
		created:   'bg-yellow-100 text-yellow-700',
		failed:    'bg-red-100 text-red-700',
		cancelled: 'bg-gray-200 text-gray-600',
		refunded:  'bg-blue-100 text-blue-700'
	}
	return (
		<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${map[status] || 'bg-gray-100 text-gray-600'}`}>
			{status}
		</span>
	)
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color = 'indigo', sub }) => (
	<div className="flex items-center gap-4 rounded-xl bg-white p-4 shadow">
		<div className={`rounded-lg bg-${color}-100 p-3`}>
			<Icon className={`h-7 w-7 text-${color}-600`} />
		</div>
		<div>
			<p className="text-sm text-gray-500">{label}</p>
			<p className="text-2xl font-bold text-gray-800">{value}</p>
			{sub && <p className="text-xs text-gray-400">{sub}</p>}
		</div>
	</div>
)

// ─── Section Header ───────────────────────────────────────────────────────────
const SectionHeader = ({ title, onRefresh, loading }) => (
	<div className="mb-3 flex items-center justify-between">
		<h2 className="text-xl font-bold text-gray-800">{title}</h2>
		{onRefresh && (
			<button
				onClick={onRefresh}
				disabled={loading}
				className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-60"
			>
				<ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
				Refresh
			</button>
		)}
	</div>
)

// ─── Table wrapper ────────────────────────────────────────────────────────────
const Table = ({ headers, children, empty }) => (
	<div className="overflow-x-auto rounded-xl border border-indigo-100 bg-white shadow">
		<table className="min-w-full text-sm">
			<thead>
				<tr className="bg-gradient-to-r from-indigo-800 to-blue-700 text-white">
					{headers.map((h) => (
						<th key={h} className="whitespace-nowrap px-4 py-2 text-left font-semibold">
							{h}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{children}
				{empty && (
					<tr>
						<td colSpan={headers.length} className="py-8 text-center text-gray-400">
							{empty}
						</td>
					</tr>
				)}
			</tbody>
		</table>
	</div>
)

const TR = ({ children, even }) => (
	<tr className={`border-t border-indigo-50 ${even ? 'bg-indigo-50/40' : 'bg-white'}`}>{children}</tr>
)
const TD = ({ children, className = '' }) => (
	<td className={`whitespace-nowrap px-4 py-2 text-gray-700 ${className}`}>{children}</td>
)

// ═══════════════════════════════════════════════════════════════════════════════
const AdminDashboard = () => {
	const { auth } = useContext(AuthContext)
	const navigate = useNavigate()

	const [activeTab, setActiveTab]   = useState('Overview')
	const [loading, setLoading]       = useState(false)
	const [stats, setStats]           = useState(null)
	const [payments, setPayments]     = useState([])
	const [payFilter, setPayFilter]   = useState('all')
	const [paySearch, setPaySearch]   = useState('')
	const [payPage, setPayPage]       = useState(1)
	const [payTotal, setPayTotal]     = useState(0)
	const [locks, setLocks]           = useState([])
	const [waitlists, setWaitlists]   = useState([])
	const [emailLogs, setEmailLogs]   = useState([])
	const [showtimes, setShowtimes]   = useState([])
	const [users, setUsers]           = useState([])
	const [movies, setMovies]         = useState([])
	const [cinemas, setCinemas]       = useState([])

	// ── Modals / forms ──────────────────────────────────────────────────────
	const [movieForm, setMovieForm]   = useState({ name: '', length: '', img: '' })
	const [editMovie, setEditMovie]   = useState(null)
	const [cinemaForm, setCinemaForm] = useState({ name: '' })
	const [editCinema, setEditCinema] = useState(null)
	const [theaterForm, setTheaterForm] = useState({ cinemaId: '', row: '', column: '' })
	const [editTheater, setEditTheater] = useState(null)
	const [showForm, setShowForm]     = useState('')

	const headers = {}

	// ── Fetch helpers ───────────────────────────────────────────────────────
	const fetchStats = async () => {
		setLoading(true)
		try {
			const r = await axios.get('/admin/stats', { headers })
			setStats(r.data.data)
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to load stats') }
		finally { setLoading(false) }
	}

	const fetchPayments = async () => {
		setLoading(true)
		try {
			const r = await axios.get(`/admin/payments?status=${payFilter}&page=${payPage}&limit=20&search=${paySearch}`, { headers })
			setPayments(r.data.data)
			setPayTotal(r.data.total)
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to load payments') }
		finally { setLoading(false) }
	}

	const fetchLocks = async () => {
		setLoading(true)
		try {
			const r = await axios.get('/admin/seatlocks', { headers })
			setLocks(r.data.data)
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to load locks') }
		finally { setLoading(false) }
	}

	const fetchShowtimes = async () => {
		setLoading(true)
		try {
			const r = await axios.get('/admin/showtimes', { headers })
			setShowtimes(r.data.data)
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to load showtimes') }
		finally { setLoading(false) }
	}

	const fetchWaitlists = async () => {
		setLoading(true)
		try {
			const r = await axios.get('/waitlist/admin/all', { headers })
			setWaitlists(r.data.data)
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to load waitlists') }
		finally { setLoading(false) }
	}

	const fetchEmailLogs = async () => {
		setLoading(true)
		try {
			const r = await axios.get('/email/logs', { headers })
			setEmailLogs(r.data.data)
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to load email logs') }
		finally { setLoading(false) }
	}

	const fetchUsers = async () => {
		setLoading(true)
		try {
			const r = await axios.get('/auth/user', { headers })
			setUsers(r.data.data)
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to load users') }
		finally { setLoading(false) }
	}

	const fetchMovies = async () => {
		setLoading(true)
		try {
			const r = await axios.get('/movie', { headers })
			setMovies(r.data.data)
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to load movies') }
		finally { setLoading(false) }
	}

	const fetchCinemas = async () => {
		setLoading(true)
		try {
			const r = await axios.get('/cinema/unreleased', { headers })
			setCinemas(r.data.data)
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to load cinemas') }
		finally { setLoading(false) }
	}

	// Load on tab switch
	useEffect(() => {
		if (activeTab === 'Overview')              fetchStats()
		if (activeTab === 'Payments')              fetchPayments()
		if (activeTab === 'Seat Locks')            fetchLocks()
		if (activeTab === 'Waitlists')             fetchWaitlists()
		if (activeTab === 'Email Logs')            fetchEmailLogs()
		if (activeTab === 'Showtimes')             fetchShowtimes()
		if (activeTab === 'Users')                 fetchUsers()
		if (activeTab === 'Movies')                fetchMovies()
		if (activeTab === 'Cinemas & Theaters')    fetchCinemas()
	}, [activeTab, payFilter, payPage])

	// ── Actions ─────────────────────────────────────────────────────────────
	const releaseLock = async (id) => {
		if (!window.confirm('Force-release this seat lock?')) return
		try {
			await axios.delete(`/admin/seatlocks/${id}`, { headers })
			toast.success('Lock released')
			fetchLocks()
		} catch (e) { toast.error('Failed') }
	}

	const cleanupLocks = async () => {
		try {
			const r = await axios.delete('/admin/seatlocks/cleanup', { headers })
			toast.success(`Cleaned up ${r.data.deleted} expired lock(s)`)
			fetchLocks()
		} catch (e) { toast.error('Cleanup failed') }
	}

	const runReminders = async () => {
		try {
			const r = await axios.post('/email/reminders/run', {}, { headers })
			toast.success(`Reminder scan complete: ${r.data.processed} ticket(s) due`)
			fetchEmailLogs()
		} catch (e) { toast.error(e.response?.data?.message || 'Reminder scan failed') }
	}

	const updateUserRole = async (id, role) => {
		try {
			await axios.put(`/auth/user/${id}`, { role }, { headers })
			toast.success(`Role updated to ${role}`)
			fetchUsers()
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to update role') }
	}

	const deleteUser = async (id, name) => {
		if (!window.confirm(`Delete user "${name}"? This cannot be undone.`)) return
		try {
			await axios.delete(`/auth/user/${id}`, { headers })
			toast.success('User deleted')
			fetchUsers()
		} catch (e) { toast.error(e.response?.data?.message || 'Failed to delete user') }
	}

	// Movie CRUD
	const saveMovie = async () => {
		try {
			if (editMovie) {
				await axios.put(`/movie/${editMovie._id}`, movieForm, { headers })
				toast.success('Movie updated')
			} else {
				await axios.post('/movie', movieForm, { headers })
				toast.success('Movie created')
			}
			setMovieForm({ name: '', length: '', img: '' })
			setEditMovie(null)
			setShowForm('')
			fetchMovies()
		} catch (e) { toast.error(e.response?.data?.message || 'Failed') }
	}

	const deleteMovie = async (id, name) => {
		if (!window.confirm(`Delete movie "${name}"? All its showtimes will also be deleted.`)) return
		try {
			await axios.delete(`/movie/${id}`, { headers })
			toast.success('Movie deleted')
			fetchMovies()
		} catch (e) { toast.error('Failed') }
	}

	// Cinema CRUD
	const saveCinema = async () => {
		try {
			if (editCinema) {
				await axios.put(`/cinema/${editCinema._id}`, cinemaForm, { headers })
				toast.success('Cinema updated')
			} else {
				await axios.post('/cinema', cinemaForm, { headers })
				toast.success('Cinema created')
			}
			setCinemaForm({ name: '' })
			setEditCinema(null)
			setShowForm('')
			fetchCinemas()
		} catch (e) { toast.error(e.response?.data?.message || 'Failed') }
	}

	const deleteCinema = async (id, name) => {
		if (!window.confirm(`Delete cinema "${name}"? All its theaters and showtimes will also be deleted.`)) return
		try {
			await axios.delete(`/cinema/${id}`, { headers })
			toast.success('Cinema deleted')
			fetchCinemas()
		} catch (e) { toast.error('Failed') }
	}

	// Theater
	const saveTheater = async () => {
		try {
			const payload = {
				row: theaterForm.row.toUpperCase(),
				column: Number(theaterForm.column)
			}
			if (editTheater) {
				await axios.put(`/theater/${editTheater._id}`, payload, { headers })
				toast.success('Theater seat plan updated')
			} else {
				await axios.post('/theater', { ...payload, cinema: theaterForm.cinemaId }, { headers })
				toast.success('Theater added')
			}
			setTheaterForm({ cinemaId: '', row: '', column: '' })
			setEditTheater(null)
			setShowForm('')
			fetchCinemas()
		} catch (e) { toast.error(e.response?.data?.message || 'Failed') }
	}

	const deleteTheater = async (id) => {
		if (!window.confirm('Delete this theater? All its showtimes will be deleted.')) return
		try {
			await axios.delete(`/theater/${id}`, { headers })
			toast.success('Theater deleted')
			fetchCinemas()
		} catch (e) { toast.error('Failed') }
	}

	// Showtime toggle release
	const toggleRelease = async (showtime) => {
		try {
			await axios.put(`/showtime/${showtime._id}`, { isRelease: !showtime.isRelease }, { headers })
			toast.success(showtime.isRelease ? 'Showtime hidden' : 'Showtime released')
			fetchShowtimes()
		} catch (e) { toast.error('Failed') }
	}

	const deleteShowtime = async (id) => {
		if (!window.confirm('Delete this showtime?')) return
		try {
			await axios.delete(`/showtime/${id}`, { headers })
			toast.success('Showtime deleted')
			fetchShowtimes()
		} catch (e) { toast.error('Failed') }
	}

	// ── Render ───────────────────────────────────────────────────────────────
	return (
		<div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-900 to-blue-500">
			<Navbar />
			<div className="mx-4 my-6 sm:mx-8">
				{/* ── Page title ── */}
				<h1 className="mb-4 text-3xl font-extrabold text-white drop-shadow">Admin Dashboard</h1>

				{/* ── Tab bar ── */}
				<div className="mb-5 flex flex-wrap gap-2">
					{TABS.map((tab) => (
						<button
							key={tab}
							onClick={() => setActiveTab(tab)}
							className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
								activeTab === tab
									? 'bg-white text-indigo-700 shadow'
									: 'bg-white/20 text-white hover:bg-white/30'
							}`}
						>
							{tab}
						</button>
					))}
				</div>

				{/* ─────────────── OVERVIEW ─────────────── */}
				{activeTab === 'Overview' && (
					<div className="flex flex-col gap-6">
						<SectionHeader title="Overview" onRefresh={fetchStats} loading={loading} />

						{stats ? (
							<>
								{/* Stat cards */}
								<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
									<StatCard icon={UsersIcon}           label="Total Users"          value={fmt(stats.counts.users)}          color="indigo" />
									<StatCard icon={BanknotesIcon}       label="Total Revenue"        value={fmtCurrency(stats.revenue.total)}  color="green"  />
									<StatCard icon={TicketIcon}          label="Seats Booked"         value={fmt(stats.revenue.totalSeatsBooked)} color="blue" />
									<StatCard icon={FilmIcon}            label="Movies"               value={fmt(stats.counts.movies)}          color="purple" />
									<StatCard icon={BuildingLibraryIcon} label="Cinemas"              value={fmt(stats.counts.cinemas)}         color="pink"   />
									<StatCard icon={ChartBarIcon}        label="Theaters"             value={fmt(stats.counts.theaters)}        color="orange" />
									<StatCard icon={ClockIcon}           label="Upcoming Showtimes"   value={fmt(stats.counts.upcomingShowtimes)} color="yellow" />
									<StatCard icon={LockClosedIcon}      label="Active Seat Locks"    value={fmt(stats.counts.activeLocks)}     color="red"    />
								</div>

								{/* Monthly revenue */}
								{stats.monthlyRevenue?.length > 0 && (
									<div className="rounded-xl bg-white p-4 shadow">
										<h3 className="mb-3 font-bold text-gray-700">Monthly Revenue (last 6 months)</h3>
										<div className="flex items-end gap-3 overflow-x-auto pb-2">
											{stats.monthlyRevenue.map((m, i) => {
												const maxRev = Math.max(...stats.monthlyRevenue.map((x) => x.revenue))
												const height = Math.max(8, Math.round((m.revenue / maxRev) * 120))
												const monthName = new Date(m._id.year, m._id.month - 1).toLocaleString('en', { month: 'short', year: '2-digit' })
												return (
													<div key={i} className="flex flex-col items-center gap-1">
														<span className="text-xs font-semibold text-indigo-700">{fmtCurrency(m.revenue / 100)}</span>
														<div
															className="w-12 rounded-t-md bg-gradient-to-t from-indigo-600 to-blue-400"
															style={{ height: `${height}px` }}
														/>
														<span className="text-xs text-gray-500">{monthName}</span>
														<span className="text-xs text-gray-400">{m.bookings} bookings</span>
													</div>
												)
											})}
										</div>
									</div>
								)}

								{/* Recent payments */}
								<div className="rounded-xl bg-white p-4 shadow">
									<h3 className="mb-3 font-bold text-gray-700">Recent Payments</h3>
									<Table headers={['User', 'Amount', 'Status', 'Date']}>
										{stats.recentPayments?.map((p, i) => (
											<TR key={p._id} even={i % 2 === 0}>
												<TD>{p.user?.username || '—'}</TD>
												<TD>{fmtCurrency((p.amount || 0) / 100)}</TD>
												<TD>{statusBadge(p.status)}</TD>
												<TD>{fmtDate(p.createdAt)}</TD>
											</TR>
										))}
									</Table>
								</div>
							</>
						) : (
							<div className="flex items-center justify-center py-20 text-white text-xl">
								{loading ? 'Loading...' : 'No data'}
							</div>
						)}
					</div>
				)}

				{/* ─────────────── PAYMENTS ─────────────── */}
				{activeTab === 'Payments' && (
					<div className="flex flex-col gap-4">
						<SectionHeader title="All Payments" onRefresh={fetchPayments} loading={loading} />

						{/* Filters */}
						<div className="flex flex-wrap gap-3">
							{['all', 'paid', 'created', 'failed', 'cancelled', 'refunded'].map((s) => (
								<button
									key={s}
									onClick={() => { setPayFilter(s); setPayPage(1) }}
									className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize ${
										payFilter === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-indigo-50'
									}`}
								>
									{s}
								</button>
							))}
							<div className="relative ml-auto">
								<MagnifyingGlassIcon className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
								<input
									className="rounded-lg border border-gray-200 py-1.5 pl-8 pr-3 text-sm outline-none"
									placeholder="Search user / order ID"
									value={paySearch}
									onChange={(e) => setPaySearch(e.target.value)}
									onKeyDown={(e) => e.key === 'Enter' && fetchPayments()}
								/>
							</div>
						</div>

						<Table
							headers={['User', 'Email', 'Movie', 'Seats', 'Amount', 'Status', 'Order ID', 'Payment ID', 'Date']}
							empty={!loading && payments.length === 0 ? 'No payments found' : undefined}
						>
							{payments.map((p, i) => (
								<TR key={p._id} even={i % 2 === 0}>
									<TD>{p.user?.username || '—'}</TD>
									<TD>{p.user?.email || '—'}</TD>
									<TD>{p.showtime?.movie?.name || '—'}</TD>
									<TD>{p.seats?.map((s) => `${s.row}${s.number}`).join(', ') || '—'}</TD>
									<TD>{fmtCurrency((p.amount || 0) / 100)}</TD>
									<TD>{statusBadge(p.status)}</TD>
									<TD className="font-mono text-xs">{p.razorpayOrderId?.slice(-12) || '—'}</TD>
									<TD className="font-mono text-xs">{p.razorpayPaymentId?.slice(-12) || '—'}</TD>
									<TD>{fmtDate(p.createdAt)}</TD>
								</TR>
							))}
						</Table>

						{/* Pagination */}
						<div className="flex items-center justify-between text-white">
							<span className="text-sm">Total: {payTotal}</span>
							<div className="flex gap-2">
								<button disabled={payPage <= 1} onClick={() => setPayPage(p => p - 1)}
									className="rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold disabled:opacity-40 hover:bg-white/30">
									← Prev
								</button>
								<span className="text-sm px-2 py-1">Page {payPage}</span>
								<button disabled={payPage * 20 >= payTotal} onClick={() => setPayPage(p => p + 1)}
									className="rounded-lg bg-white/20 px-3 py-1 text-sm font-semibold disabled:opacity-40 hover:bg-white/30">
									Next →
								</button>
							</div>
						</div>
					</div>
				)}

				{/* ─────────────── SEAT LOCKS ─────────────── */}
				{activeTab === 'Seat Locks' && (
					<div className="flex flex-col gap-4">
						<div className="flex items-center justify-between">
							<SectionHeader title="Active Seat Locks" onRefresh={fetchLocks} loading={loading} />
							<button
								onClick={cleanupLocks}
								className="flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-400"
							>
								<TrashIcon className="h-4 w-4" /> Cleanup Expired
							</button>
						</div>

						<Table
							headers={['User', 'Email', 'Seats', 'Showtime', 'Expires At', 'Action']}
							empty={!loading && locks.length === 0 ? 'No active seat locks' : undefined}
						>
							{locks.map((lock, i) => (
								<TR key={lock._id} even={i % 2 === 0}>
									<TD>{lock.userId?.username || '—'}</TD>
									<TD>{lock.userId?.email || '—'}</TD>
									<TD>{lock.seatNumber || '—'}</TD>
									<TD>{fmtDate(lock.showtimeId?.showtime)}</TD>
									<TD>{fmtDate(lock.expiresAt)}</TD>
									<TD>
										<button
											onClick={() => releaseLock(lock._id)}
											className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
										>
											Release
										</button>
									</TD>
								</TR>
							))}
						</Table>
					</div>
				)}

				{/* ─────────────── SHOWTIMES ─────────────── */}
				{activeTab === 'Waitlists' && (
					<div className="flex flex-col gap-4">
						<SectionHeader title="Show Waitlists" onRefresh={fetchWaitlists} loading={loading} />
						<Table
							headers={['User', 'Email', 'Movie', 'Showtime', 'Status', 'Joined', 'Held Seats', 'Offer Expires']}
							empty={!loading && waitlists.length === 0 ? 'No waitlist entries' : undefined}
						>
							{waitlists.map((entry, i) => (
								<TR key={entry._id} even={i % 2 === 0}>
									<TD>{entry.user?.username || 'â€”'}</TD>
									<TD>{entry.user?.email || 'â€”'}</TD>
									<TD>{entry.showtime?.movie?.name || 'â€”'}</TD>
									<TD>{fmtDate(entry.showtime?.showtime)}</TD>
									<TD>{statusBadge(entry.status)}</TD>
									<TD>{fmtDate(entry.joinedAt)}</TD>
									<TD>{entry.offeredSeats?.join(', ') || 'â€”'}</TD>
									<TD>{fmtDate(entry.offerExpiresAt)}</TD>
								</TR>
							))}
						</Table>
					</div>
				)}

				{activeTab === 'Email Logs' && (
					<div className="flex flex-col gap-4">
						<div className="flex items-center justify-between">
							<SectionHeader title="Email Delivery Logs" onRefresh={fetchEmailLogs} loading={loading} />
							<button onClick={runReminders} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
								Run Reminder Scan
							</button>
						</div>
						<Table
							headers={['Type', 'Recipient', 'Movie', 'Subject', 'Status', 'Provider ID', 'Date']}
							empty={!loading && emailLogs.length === 0 ? 'No email logs' : undefined}
						>
							{emailLogs.map((log, i) => (
								<TR key={log._id} even={i % 2 === 0}>
									<TD>{log.type?.replaceAll('_', ' ')}</TD>
									<TD>{log.recipient}</TD>
									<TD>{log.showtime?.movie?.name || 'â€”'}</TD>
									<TD>{log.subject}</TD>
									<TD>{statusBadge(log.status)}</TD>
									<TD className="font-mono text-xs">{log.providerMessageId || log.error || 'â€”'}</TD>
									<TD>{fmtDate(log.createdAt)}</TD>
								</TR>
							))}
						</Table>
					</div>
				)}

				{activeTab === 'Showtimes' && (
					<div className="flex flex-col gap-4">
						<SectionHeader title="All Showtimes" onRefresh={fetchShowtimes} loading={loading} />

						<Table
							headers={['Movie', 'Cinema', 'Theater', 'Date & Time', 'Seats Booked', 'Capacity', 'Status', 'Actions']}
							empty={!loading && showtimes.length === 0 ? 'No showtimes found' : undefined}
						>
							{showtimes.map((s, i) => {
								const capacity = s.theater?.seatPlan
									? (() => {
										const row = s.theater.seatPlan.row
										let rowCount = 0
										for (let k = 64; k <= (row.length === 2 ? row.charCodeAt(0) : 64); k++) {
											for (let j = 65; j <= (k === row.charCodeAt(0) || row.length === 1 ? row.charCodeAt(row.length - 1) : 90); j++) rowCount++
										}
										return rowCount * s.theater.seatPlan.column
									})()
									: '?'
								return (
									<TR key={s._id} even={i % 2 === 0}>
										<TD>{s.movie?.name || '—'}</TD>
										<TD>{s.theater?.cinema?.name || '—'}</TD>
										<TD>#{s.theater?.number}</TD>
										<TD>{fmtDate(s.showtime)}</TD>
										<TD>{s.seats?.length || 0}</TD>
										<TD>{capacity}</TD>
										<TD>
											<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s.isRelease ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
												{s.isRelease ? 'Released' : 'Hidden'}
											</span>
										</TD>
										<TD>
											<div className="flex gap-2">
												<button
													onClick={() => toggleRelease(s)}
													className={`rounded px-2 py-1 text-xs font-semibold ${s.isRelease ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
												>
													{s.isRelease ? 'Hide' : 'Release'}
												</button>
												<button
													onClick={() => navigate(`/showtime/${s._id}`)}
													className="rounded bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200"
												>
													View
												</button>
												<button
													onClick={() => deleteShowtime(s._id)}
													className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
												>
													Delete
												</button>
											</div>
										</TD>
									</TR>
								)
							})}
						</Table>
					</div>
				)}

				{/* ─────────────── USERS ─────────────── */}
				{activeTab === 'Users' && (
					<div className="flex flex-col gap-4">
						<SectionHeader title="All Users" onRefresh={fetchUsers} loading={loading} />

						<Table
							headers={['Username', 'Email', 'Role', 'Tickets', 'Joined', 'Actions']}
							empty={!loading && users.length === 0 ? 'No users found' : undefined}
						>
							{users.map((u, i) => (
								<TR key={u._id} even={i % 2 === 0}>
									<TD className="font-semibold">{u.username}</TD>
									<TD>{u.email}</TD>
									<TD>
										<span className={`rounded-full px-2 py-0.5 text-xs font-bold ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
											{u.role}
										</span>
									</TD>
									<TD>{u.tickets?.length || 0}</TD>
									<TD>{fmtDate(u.createdAt)}</TD>
									<TD>
										<div className="flex gap-2">
											{u.role === 'user' ? (
												<button
													onClick={() => updateUserRole(u._id, 'admin')}
													disabled={auth.id === u._id}
													className="rounded bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
												>
													Make Admin
												</button>
											) : (
												<button
													onClick={() => updateUserRole(u._id, 'user')}
													disabled={auth.id === u._id}
													className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
												>
													Make User
												</button>
											)}
											<button
												onClick={() => deleteUser(u._id, u.username)}
												disabled={auth.id === u._id}
												className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50"
											>
												Delete
											</button>
										</div>
									</TD>
								</TR>
							))}
						</Table>
					</div>
				)}

				{/* ─────────────── MOVIES ─────────────── */}
				{activeTab === 'Movies' && (
					<div className="flex flex-col gap-4">
						<div className="flex items-center justify-between">
							<SectionHeader title="Movies" onRefresh={fetchMovies} loading={loading} />
							<button
								onClick={() => { setShowForm('movie'); setEditMovie(null); setMovieForm({ name: '', length: '', img: '' }) }}
								className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
							>
								+ Add Movie
							</button>
						</div>

						{/* Movie form */}
						{showForm === 'movie' && (
							<div className="rounded-xl bg-white p-4 shadow">
								<h3 className="mb-3 font-bold text-gray-800">{editMovie ? 'Edit Movie' : 'Add Movie'}</h3>
								<div className="flex flex-col gap-3">
									<input className="rounded-lg border px-3 py-2 text-sm outline-indigo-400"
										placeholder="Movie name" value={movieForm.name}
										onChange={(e) => setMovieForm(f => ({ ...f, name: e.target.value }))} />
									<input className="rounded-lg border px-3 py-2 text-sm outline-indigo-400"
										placeholder="Length (minutes)" type="number" value={movieForm.length}
										onChange={(e) => setMovieForm(f => ({ ...f, length: e.target.value }))} />
									<input className="rounded-lg border px-3 py-2 text-sm outline-indigo-400"
										placeholder="Image URL or filename (e.g. /posters/movie.svg)" value={movieForm.img}
										onChange={(e) => setMovieForm(f => ({ ...f, img: e.target.value }))} />
									<div className="flex gap-2">
										<button onClick={saveMovie} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
											{editMovie ? 'Update' : 'Create'}
										</button>
										<button onClick={() => { setShowForm(''); setEditMovie(null) }}
											className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">
											Cancel
										</button>
									</div>
								</div>
							</div>
						)}

						<Table
							headers={['Poster', 'Name', 'Length', 'Actions']}
							empty={!loading && movies.length === 0 ? 'No movies' : undefined}
						>
							{movies.map((m, i) => (
								<TR key={m._id} even={i % 2 === 0}>
									<TD>
										<img src={m.img} alt={m.name} className="h-12 w-8 rounded object-cover"
											onError={(e) => { e.target.src = '/posters/movie-placeholder.svg' }} />
									</TD>
									<TD className="font-semibold">{m.name}</TD>
									<TD>{m.length} min</TD>
									<TD>
										<div className="flex gap-2">
											<button
												onClick={() => { setEditMovie(m); setMovieForm({ name: m.name, length: m.length, img: m.img }); setShowForm('movie') }}
												className="rounded bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200"
											>Edit</button>
											<button
												onClick={() => deleteMovie(m._id, m.name)}
												className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
											>Delete</button>
										</div>
									</TD>
								</TR>
							))}
						</Table>
					</div>
				)}

				{/* ─────────────── CINEMAS & THEATERS ─────────────── */}
				{activeTab === 'Cinemas & Theaters' && (
					<div className="flex flex-col gap-4">
						<div className="flex flex-wrap items-center gap-3">
							<SectionHeader title="Cinemas & Theaters" onRefresh={fetchCinemas} loading={loading} />
							<button onClick={() => { setShowForm('cinema'); setEditCinema(null); setCinemaForm({ name: '' }) }}
								className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
								+ Add Cinema
							</button>
							<button onClick={() => { setEditTheater(null); setTheaterForm({ cinemaId: '', row: '', column: '' }); setShowForm('theater') }}
								className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
								+ Add Theater
							</button>
						</div>

						{/* Cinema form */}
						{showForm === 'cinema' && (
							<div className="rounded-xl bg-white p-4 shadow">
								<h3 className="mb-3 font-bold text-gray-800">{editCinema ? 'Edit Cinema' : 'Add Cinema'}</h3>
								<div className="flex flex-col gap-3">
									<input className="rounded-lg border px-3 py-2 text-sm outline-indigo-400"
										placeholder="Cinema name" value={cinemaForm.name}
										onChange={(e) => setCinemaForm({ name: e.target.value })} />
									<div className="flex gap-2">
										<button onClick={saveCinema} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
											{editCinema ? 'Update' : 'Create'}
										</button>
										<button onClick={() => { setShowForm(''); setEditCinema(null) }}
											className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">
											Cancel
										</button>
									</div>
								</div>
							</div>
						)}

						{/* Theater form */}
						{showForm === 'theater' && (
							<div className="rounded-xl bg-white p-4 shadow">
								<h3 className="mb-3 font-bold text-gray-800">{editTheater ? `Edit Theater #${editTheater.number}` : 'Add Theater'}</h3>
								<div className="flex flex-col gap-3">
									<select className="rounded-lg border px-3 py-2 text-sm outline-indigo-400"
										value={theaterForm.cinemaId}
										disabled={!!editTheater}
										onChange={(e) => setTheaterForm(f => ({ ...f, cinemaId: e.target.value }))}>
										<option value="">Select Cinema</option>
										{cinemas.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
									</select>
									<input className="rounded-lg border px-3 py-2 text-sm outline-indigo-400"
										placeholder="Max row (e.g. J = 10 rows, or AA)" value={theaterForm.row}
										onChange={(e) => setTheaterForm(f => ({ ...f, row: e.target.value.toUpperCase() }))} />
									<input className="rounded-lg border px-3 py-2 text-sm outline-indigo-400"
										placeholder="Seats per row (columns, 1-120)" type="number" value={theaterForm.column}
										onChange={(e) => setTheaterForm(f => ({ ...f, column: e.target.value }))} />
									<div className="flex gap-2">
										<button onClick={saveTheater} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
											{editTheater ? 'Update Seat Plan' : 'Add Theater'}
										</button>
										<button onClick={() => { setShowForm(''); setEditTheater(null) }}
											className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300">
											Cancel
										</button>
									</div>
								</div>
							</div>
						)}

						{/* Cinema list */}
						{cinemas.map((cinema) => (
							<div key={cinema._id} className="rounded-xl bg-white shadow overflow-hidden">
								<div className="flex items-center justify-between bg-gradient-to-r from-indigo-700 to-blue-600 px-4 py-3">
									<h3 className="font-bold text-white text-lg">{cinema.name}</h3>
									<div className="flex gap-2">
										<button
											onClick={() => { setEditCinema(cinema); setCinemaForm({ name: cinema.name }); setShowForm('cinema') }}
											className="rounded bg-white/20 px-2 py-1 text-xs font-semibold text-white hover:bg-white/30"
										>Edit</button>
										<button
											onClick={() => deleteCinema(cinema._id, cinema.name)}
											className="rounded bg-red-400/80 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500"
										>Delete</button>
									</div>
								</div>
								<div className="p-4">
									{cinema.theaters?.length === 0 ? (
										<p className="text-sm text-gray-400">No theaters yet.</p>
									) : (
										<div className="overflow-x-auto">
											<table className="min-w-full text-sm">
												<thead>
													<tr className="bg-indigo-50">
														<th className="px-3 py-2 text-left font-semibold text-gray-600">Theater #</th>
														<th className="px-3 py-2 text-left font-semibold text-gray-600">Seat Plan</th>
														<th className="px-3 py-2 text-left font-semibold text-gray-600">Capacity</th>
														<th className="px-3 py-2 text-left font-semibold text-gray-600">Showtimes</th>
														<th className="px-3 py-2 text-left font-semibold text-gray-600">Action</th>
													</tr>
												</thead>
												<tbody>
													{cinema.theaters.map((theater, i) => (
														<tr key={theater._id} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
															<td className="px-3 py-2 font-semibold">#{theater.number}</td>
															<td className="px-3 py-2">Row up to {theater.seatPlan?.row} × {theater.seatPlan?.column} cols</td>
															<td className="px-3 py-2">{rowToNumber(theater.seatPlan?.row) * theater.seatPlan?.column} seats</td>
															<td className="px-3 py-2">{theater.showtimes?.length || 0} showtimes</td>
															<td className="px-3 py-2">
																<div className="flex gap-2">
																<button
																	onClick={() => {
																		setEditTheater(theater)
																		setTheaterForm({ cinemaId: cinema._id, row: theater.seatPlan.row, column: theater.seatPlan.column })
																		setShowForm('theater')
																	}}
																	className="rounded bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-200"
																>Edit</button>
																<button
																	onClick={() => deleteTheater(theater._id)}
																	className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-200"
																>Delete</button>
																</div>
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	)
}

export default AdminDashboard