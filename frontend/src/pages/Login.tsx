import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { login, setup } = useAuth()
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'
  const [mode, setMode] = useState<'login' | 'setup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'setup') {
        await setup(email, password)
      } else {
        await login(email, password)
      }
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-12">
      <h1 className="text-xl font-semibold">
        {mode === 'setup' ? t('auth.setupTitle') : t('auth.loginTitle')}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            {t('auth.email')}
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            {t('auth.password')}
          </label>
          <Input
            id="password"
            type="password"
            autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full"
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {mode === 'setup' ? t('auth.createAccount') : t('auth.logIn')}
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {mode === 'login' ? (
          <button
            type="button"
            onClick={() => setMode('setup')}
            className={cn('text-primary underline-offset-4 hover:underline')}
          >
            {t('auth.firstTimeCreateAdmin')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMode('login')}
            className={cn('text-primary underline-offset-4 hover:underline')}
          >
            {t('auth.backToLogin')}
          </button>
        )}
      </p>
    </div>
  )
}
