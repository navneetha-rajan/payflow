import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import { VectorAuthProvider, AuthCallback, useAuth } from '@govector/auth'
import { Spinner, Toaster } from '@vector-ui'
import { LandingPage } from '@/pages/LandingPage'
import { AppLayout } from '@/components/AppLayout'
import DashboardPage from '@/pages/DashboardPage'
import InvoicesPage from '@/pages/InvoicesPage'
import ClientsPage from '@/pages/ClientsPage'
import SettingsPage from '@/pages/SettingsPage'
import InvoiceDetailPage from '@/pages/InvoiceDetailPage'
import ClientProfilePage from '@/pages/ClientProfilePage'
import PricingPage from '@/pages/PricingPage'

const authConfig = {
  authProxyUrl: import.meta.env.VITE_AUTH_PROXY_URL,
  appId: import.meta.env.VITE_APP_ID,
  appVersionId: import.meta.env.VITE_APP_VERSION_ID,
}

function AuthCallbackPage() {
  const navigate = useNavigate()
  return <AuthCallback onSuccess={() => navigate('/dashboard', { replace: true })} />
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--color-bg)',
      }}>
        <Spinner />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  return (
    <VectorAuthProvider config={authConfig}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:clientId" element={<ClientProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/pricing" element={<PricingPage />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </VectorAuthProvider>
  )
}

export default App
