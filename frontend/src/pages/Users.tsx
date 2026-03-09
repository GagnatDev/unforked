import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/api'

export default function Users() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user?.role !== 'admin') {
    return (
      <div className="text-destructive">
        {t('auth.adminOnly')}
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      await api.users.create({ email, password, role })
      setSuccess(t('auth.userCreated'))
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('nav.users')}</h1>
      <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
        <div>
          <label htmlFor="user-email" className="mb-1 block text-sm font-medium">
            {t('auth.email')}
          </label>
          <Input
            id="user-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="user-password" className="mb-1 block text-sm font-medium">
            {t('auth.password')}
          </label>
          <Input
            id="user-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="user-role" className="mb-1 block text-sm font-medium">
            {t('auth.role')}
          </label>
          <select
            id="user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="user">{t('auth.roleUser')}</option>
            <option value="admin">{t('auth.roleAdmin')}</option>
          </select>
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-green-600 dark:text-green-400" role="status">
            {success}
          </p>
        )}
        <Button type="submit" disabled={submitting}>
          {t('auth.addUser')}
        </Button>
      </form>
    </div>
  )
}
