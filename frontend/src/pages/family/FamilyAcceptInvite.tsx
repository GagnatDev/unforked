import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type FamilyAcceptInviteProps = {
  token: string
  busy: boolean
  onTokenChange: (next: string) => void
  onAcceptInvite: (e: React.FormEvent) => void
}

export function FamilyAcceptInvite({
  token,
  busy,
  onTokenChange,
  onAcceptInvite,
}: FamilyAcceptInviteProps) {
  const { t } = useTranslation()

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{t('family.acceptInviteTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('family.acceptInviteHint')}</p>
      <form onSubmit={onAcceptInvite} className="max-w-md space-y-2">
        <Input
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder={t('family.inviteTokenPlaceholder')}
          className="font-mono text-sm"
        />
        <Button type="submit" disabled={busy || !token.trim()}>
          {busy ? t('common.loading') : t('family.joinFamily')}
        </Button>
      </form>
    </section>
  )
}
