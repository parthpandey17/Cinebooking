import axios from '../config/axiosConfig'
import { createContext, useEffect, useState } from 'react'

const AuthContext = createContext()
const emptyAuth = { id: null, username: null, email: null, role: null, token: null }

const getStoredAuth = () => {
	try {
		return JSON.parse(localStorage.getItem('auth')) || emptyAuth
	} catch {
		return emptyAuth
	}
}

const AuthContextProvider = ({ children }) => {
	const [auth, setAuth] = useState(getStoredAuth) // { id, username, email, role, token }

	useEffect(() => {
		localStorage.setItem('auth', JSON.stringify(auth))
	}, [auth])

	useEffect(() => {
		if (!auth.token) return

		const getUser = async () => {
			try {
				const response = await axios.get('/auth/me', {
					headers: { Authorization: `Bearer ${auth.token}` }
				})
				const user = response.data.data
				setAuth((current) => ({
					...current,
					id:       user._id,
					username: user.username,
					email:    user.email,
					role:     user.role
				}))
			} catch (error) {
				// Only log the user out when the token is actually rejected
				// (401 Unauthorized / 403 Forbidden). A transient failure — network
				// blip, 5xx, or the 503 the API returns while its DB connection is
				// still warming up (e.g. Render cold start) — must NOT wipe the
				// session. Previously any error here cleared auth, which bounced the
				// user to /login mid-session and made in-flight authed requests
				// (e.g. seat-lock release, join-waitlist) send `Bearer null`.
				const status = error?.response?.status
				if (status === 401 || status === 403) {
					setAuth(emptyAuth)
				} else {
					console.warn('Auth refresh failed, keeping existing session:', error?.message)
				}
			}
		}

		getUser()
	}, [auth.token])

	return <AuthContext.Provider value={{ auth, setAuth }}>{children}</AuthContext.Provider>
}

export { AuthContext, AuthContextProvider }