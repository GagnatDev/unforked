import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'

export default function RegisterInvite() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { registerWithInvite, authDisabled } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(() => searchParams.get('token') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (authDisabled) {
      setError(t('family.registerDisabledInDev'))
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await registerWithInvite(token.trim(), email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-12">
      <h1 className="text-xl font-semibold">{t('family.registerWithInviteTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('family.registerWithInviteHint')}</p>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label htmlFor="invite-token" className="mb-1 block text-sm font-medium">
            {t('family.inviteToken')}
          </label>
          <Input
            id="invite-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            className="font-mono text-sm"
          />
        </div>
        <div>
          <label htmlFor="invite-email" className="mb-1 block text-sm font-medium">
            {t('auth.email')}
          </label>
          <Input
            id="invite-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="invite-password" className="mb-1 block text-sm font-medium">
            {t('auth.password')}
          </label>
          <Input
            id="invite-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t('common.loading') : t('family.createAccountAndJoin')}
        </Button>
      </form>
    </div>
  )
}
