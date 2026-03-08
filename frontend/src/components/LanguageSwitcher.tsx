import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

const LANGUAGES = [
  { code: 'en', labelKey: 'language.en' },
  { code: 'nb', labelKey: 'language.nb' },
] as const

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = i18n.language?.startsWith('nb') ? 'nb' : 'en'

  return (
    <span className="flex items-center gap-1">
      {LANGUAGES.map(({ code, labelKey }) => (
        <Button
          key={code}
          type="button"
          variant={current === code ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => i18n.changeLanguage(code)}
          aria-label={t(labelKey)}
        >
          {t(labelKey)}
        </Button>
      ))}
    </span>
  )
}
