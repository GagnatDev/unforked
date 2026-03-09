import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, authDisabled } = useAuth()
  const location = useLocation()

  if (authDisabled) return <>{children}</>
  if (loading) return <div className="p-6">Loading...</div>
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}
