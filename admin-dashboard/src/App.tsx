import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom'

import BookingDetail from './pages/BookingDetail'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Bookings from './pages/Bookings'
import Workers from './pages/Workers'
import WorkerDetail from './pages/WorkerDetail'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Services from './pages/Services'
import ServiceAreas from './pages/ServiceAreas'
import Payments from './pages/Payments'
import Reviews from './pages/Reviews'
import Notifications from './pages/Notifications'
import OffersUpdates from './pages/OffersUpdates'
import ServiceDiscounts from './pages/ServiceDiscounts'
import Support from './pages/Support'
import Analytics from './pages/Analytics'
import WorkerEarnings from './pages/WorkerEarnings'
import Settings from './pages/Settings'
import LiveMap from './pages/LiveMap'
import AccountDeletionRequests from './pages/AccountDeletionRequests'

import AdminLayout from './layouts/AdminLayout'
import AdminGuard from './components/AdminGuard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<AdminGuard />}>
          <Route element={<AdminLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/bookings/:bookingId" element={<BookingDetail />} />
            <Route path="/workers" element={<Workers />} />
            <Route path="/workers/:workerId" element={<WorkerDetail />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/services" element={<Services />} />
            <Route path="/service-areas" element={<ServiceAreas />} />
            <Route path="/offers-updates" element={<OffersUpdates />} />
            <Route path="/duration-discounts" element={<ServiceDiscounts />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/reviews" element={<Reviews />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/customers/:customerId" element={<CustomerDetail />} />
            <Route path="/support" element={<Support />} />
            <Route path="/account-deletion" element={<AccountDeletionRequests />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/worker-earnings" element={<WorkerEarnings />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/live-map" element={<LiveMap />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}