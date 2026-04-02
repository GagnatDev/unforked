import { useTranslation } from 'react-i18next'
import { ChevronDownIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme, type Theme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

const LANGUAGES = [
  { code: 'en', labelKey: 'language.en' as const },
  { code: 'nb', labelKey: 'language.nb' as const },
] as const

type AccountMenuProps = {
  onLogout: () => void
}

export function AccountMenu({ onLogout }: AccountMenuProps) {
  const { t, i18n } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { authDisabled } = useAuth()
  const langValue = i18n.language?.startsWith('nb') ? 'nb' : 'en'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'gap-1 aria-expanded:bg-muted'
        )}
      >
        {t('nav.account')}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('nav.accountLanguage')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={langValue}
            onValueChange={(code) => {
              if (code === 'en' || code === 'nb') void i18n.changeLanguage(code)
            }}
          >
            {LANGUAGES.map(({ code, labelKey }) => (
              <DropdownMenuRadioItem key={code} value={code}>
                {t(labelKey)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('nav.accountTheme')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => {
              if (v === 'light' || v === 'dark' || v === 'system') setTheme(v as Theme)
            }}
          >
            <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">{t('theme.system')}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        {!authDisabled && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onLogout}>
              {t('auth.logOut')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
