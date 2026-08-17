import { useContext } from 'react'
import { Navigate } from 'react-router-dom'
import { AuthContext } from './context/AuthContext'

const UserRoute = ({ children }) => {
	const { auth } = useContext(AuthContext)

	if (!auth.role) return <Navigate to="/login" replace />
	if (auth.role !== 'user') return <Navigate to="/admin" replace />

	return children
}

export default UserRoute
