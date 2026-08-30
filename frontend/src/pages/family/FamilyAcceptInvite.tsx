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
    <section className="space-y-3 rounded-2xl bg-card p-4 text-card-foreground">
      <div>
        <h2 className="text-base font-semibold">{t('family.acceptInviteTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('family.acceptInviteHint')}</p>
      </div>
      <form onSubmit={onAcceptInvite} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
          placeholder={t('family.inviteTokenPlaceholder')}
          className="h-11 flex-1 rounded-xl font-mono text-sm"
        />
        <Button
          type="submit"
          disabled={busy || !token.trim()}
          className="h-11 shrink-0 rounded-full px-5"
        >
          {busy ? t('common.loading') : t('family.joinFamily')}
        </Button>
      </form>
    </section>
  )
}
