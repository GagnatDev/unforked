import { useTranslation } from 'react-i18next'

type FamilyMemberListProps = {
  members: { id: string; email: string }[]
}

export function FamilyMemberList({ members }: FamilyMemberListProps) {
  const { t } = useTranslation()

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{t('family.members')}</h2>
      <ul className="list-inside list-disc text-sm">
        {members.map((m) => (
          <li key={m.id}>{m.email}</li>
        ))}
      </ul>
    </section>
  )
}
