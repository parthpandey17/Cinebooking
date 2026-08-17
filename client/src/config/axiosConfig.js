import axios from 'axios'
import { apiBaseUrl } from './apiBaseUrl'

console.log('API base URL:', apiBaseUrl)

const instance = axios.create({
	baseURL: apiBaseUrl,
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