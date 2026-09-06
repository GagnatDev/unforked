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
import { RequireLiveSession } from '@/components/RequireLiveSession'
import { NotificationSettings } from '@/components/NotificationSettings'
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
    <div className="space-y-4">
      <header>
        <h1 className="mb-0">{t('profile.title')}</h1>
        {user && <p className="mt-1 mb-0 text-sm text-muted-foreground">{user.email}</p>}
      </header>

      {/* One sheet per job: how the app speaks and looks, then notifications,
          then the two places settings continue. */}
      <section className="space-y-4 rounded-2xl bg-card p-4 text-card-foreground">
        <h2 className="text-base font-semibold">{t('profile.preferences')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="profile-language" className="mb-1.5 block text-sm font-medium">
              {t('profile.language')}
            </label>
            <Select
              items={languageItems}
              value={langValue}
              onValueChange={(code) => {
                if (code === 'en' || code === 'nb') void i18n.changeLanguage(code)
              }}
            >
              <SelectTrigger id="profile-language" className="h-11 w-full rounded-xl">
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
            <label htmlFor="profile-theme" className="mb-1.5 block text-sm font-medium">
              {t('profile.theme')}
            </label>
            <Select
              items={themeItems}
              value={theme}
              onValueChange={(v) => {
                if (v === 'light' || v === 'dark' || v === 'system') setTheme(v as Theme)
              }}
            >
              <SelectTrigger id="profile-theme" className="h-11 w-full rounded-xl">
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

      <RequireLiveSession embedded titleKey="notifications.cardTitle">
        <NotificationSettings />
      </RequireLiveSession>

      {/* Rows, not cards: these are two doors out of this page, and a row makes
          the destination and its one-line reason read in a single sweep. */}
      <section className="rounded-2xl bg-card p-1.5 text-card-foreground">
        <h2 className="px-3 pt-2.5 pb-1.5 text-base font-semibold">{t('profile.manage')}</h2>
        <Link
          to="/family"
          className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 text-card-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground hover:no-underline"
        >
          <UsersIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t('family.title')}</span>
            <span className="block text-sm text-muted-foreground">{t('profile.familyHint')}</span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </Link>
        <Link
          to="/api-keys"
          className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 text-card-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground hover:no-underline"
        >
          <KeyRoundIcon className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{t('apiKeys.title')}</span>
            <span className="block text-sm text-muted-foreground">{t('profile.apiKeysHint')}</span>
          </span>
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      </section>
    </div>
  )
}
