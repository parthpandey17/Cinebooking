import { Route, Routes } from "react-router"
import { ToastContainer } from "react-toastify"
import AdminRoute from "./AdminRoute"
import UserRoute from "./UserRoute"
import AdminDashboard from "./pages/AdminDashboard"
import Cinema from "./pages/Cinema"
import Home from "./pages/Home"
import Login from "./pages/Login"
import Movie from "./pages/Movie"
import MyWaitlists from "./pages/MyWaitlists"
import Purchase from "./pages/Purchase"
import Register from "./pages/Register"
import Schedule from "./pages/Schedule"
import Search from "./pages/Search"
import Showtime from "./pages/Showtime"
import TicketDetail from "./pages/TicketDetail"
import TicketScanner from "./pages/TicketScanner"
import Tickets from "./pages/Tickets"
import User from "./pages/User"

function App() {
  return (
    <>
      <ToastContainer />
      <Routes>
        <Route path="/"              element={<Home />} />
        <Route path="/login"         element={<Login />} />
        <Route path="/admin/login"   element={<Login admin />} />
        <Route path="/register"      element={<Register />} />
        <Route path="/cinema"        element={<Cinema />} />
        <Route path="/showtime/:id"  element={<Showtime />} />
        <Route path="/schedule"      element={<Schedule />} />

        {/* User routes */}
        <Route path="/purchase/:id"   element={<UserRoute><Purchase /></UserRoute>} />
        <Route path="/ticket"         element={<UserRoute><Tickets /></UserRoute>} />
        <Route path="/ticket/:id"     element={<UserRoute><TicketDetail /></UserRoute>} />
        <Route path="/my-waitlists"   element={<UserRoute><MyWaitlists /></UserRoute>} />

        {/* Admin-only routes */}
        <Route path="/movie"          element={<AdminRoute><Movie /></AdminRoute>} />
        <Route path="/search"         element={<AdminRoute><Search /></AdminRoute>} />
        <Route path="/user"           element={<AdminRoute><User /></AdminRoute>} />
        <Route path="/admin"          element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/scanner"  element={<AdminRoute><TicketScanner /></AdminRoute>} />
      </Routes>
    </>
  )
}

export default App