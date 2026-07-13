import { useTranslation } from 'react-i18next'
import { ChevronRightIcon, KeyRoundIcon, UsersIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme, type Theme } from '@/contexts/ThemeContext'

const LANGUAGES = [
  { code: 'en', labelKey: 'language.en' as const },
  { code: 'nb', labelKey: 'language.nb' as const },
] as const

const THEMES = ['light', 'dark', 'system'] as const

export default function Profile() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const langValue = i18n.language?.startsWith('nb') ? 'nb' : 'en'

  const languageItems = LANGUAGES.map(({ code, labelKey }) => ({
    value: code,
    label: t(labelKey),
  }))
  const themeItems = THEMES.map((value) => ({ value, label: t(`theme.${value}`) }))

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{t('profile.title')}</h1>
        {user && <p className="text-sm text-muted-foreground">{user.email}</p>}
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('profile.preferences')}</h2>
        <div className="grid max-w-md gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-language" className="mb-1 block text-sm font-medium">
              {t('profile.language')}
            </label>
            <Select
              items={languageItems}
              value={langValue}
              onValueChange={(code) => {
                if (code === 'en' || code === 'nb') void i18n.changeLanguage(code)
              }}
            >
              <SelectTrigger id="profile-language" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {languageItems.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="profile-theme" className="mb-1 block text-sm font-medium">
              {t('profile.theme')}
            </label>
            <Select
              items={themeItems}
              value={theme}
              onValueChange={(v) => {
                if (v === 'light' || v === 'dark' || v === 'system') setTheme(v as Theme)
              }}
            >
              <SelectTrigger id="profile-theme" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {themeItems.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">{t('profile.manage')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/family"
            className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 font-medium">
              <UsersIcon className="size-4 text-muted-foreground" />
              {t('family.title')}
              <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {t('profile.familyHint')}
            </span>
          </Link>

          <Link
            to="/api-keys"
            className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 font-medium">
              <KeyRoundIcon className="size-4 text-muted-foreground" />
              {t('apiKeys.title')}
              <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" />
            </span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {t('profile.apiKeysHint')}
            </span>
          </Link>
        </div>
      </section>
    </div>
  )
}
