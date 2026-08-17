import axios from 'axios'

const PRODUCTION_API_URL = 'https://cinebooking-wx4c.onrender.com'

const envUrl = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_SERVER_URL || '')
	.trim()
	.replace(/\/+$/, '')

// DEV = local `npm run dev` only. Vercel preview/production builds always use Render.
const apiBaseURL = import.meta.env.DEV
	? envUrl || 'http://localhost:8080'
	: envUrl && !envUrl.includes('localhost')
		? envUrl
		: PRODUCTION_API_URL

console.log('API base URL:', apiBaseURL)

const instance = axios.create({
	baseURL: apiBaseURL,
	withCredentials: true
})

// ── Auto-attach the auth token to every request ────────────────────────────────
// Components were passing `Authorization: Bearer ${auth.token}` manually, so any
// time React's in-memory `auth.token` briefly lagged or was cleared, requests went
// out unauthenticated (or as `Bearer null`) and the user appeared "logged out".
// Reading the token from localStorage here (the same 'auth' key AuthContext
// persists) guarantees every request carries the token if one exists, regardless
// of component/state timing. This is a Bearer header set by our own JS, so it adds
// no CSRF surface (unlike cookie-based auth).
instance.interceptors.request.use((config) => {
	const hasAuthHeader =
		config.headers?.Authorization || config.headers?.authorization
	if (!hasAuthHeader) {
		try {
			const stored = JSON.parse(localStorage.getItem('auth') || '{}')
			if (stored?.token) {
				config.headers = config.headers || {}
				config.headers.Authorization = `Bearer ${stored.token}`
			}
		} catch {
			/* ignore malformed storage */
		}
	}
	return config
})

export default instance