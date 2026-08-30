import { useTranslation } from 'react-i18next'
import { LogOutIcon, MenuIcon, UserIcon } from 'lucide-react'
import { Link, useMatch } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

const activeItemClass = 'bg-muted font-medium text-foreground'

type UserMenuProps = {
  onLogout: () => void
}

/**
 * Menu for the things that are neither a destination nor an action on the
 * current screen: profile (settings live there) and logout. The four
 * destinations are tabs, and the recipe actions live on the recipe library, so
 * nothing is duplicated here.
 */
export function UserMenu({ onLogout }: UserMenuProps) {
  const { t } = useTranslation()

  const profileMatch = useMatch({ path: '/profile', end: true })
  const familyMatch = useMatch({ path: '/family', end: true })
  const apiKeysMatch = useMatch({ path: '/api-keys', end: true })
  const menuMatch = profileMatch ?? familyMatch ?? apiKeysMatch

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('nav.menu')}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'aria-expanded:bg-muted',
          menuMatch && 'bg-muted text-foreground'
        )}
      >
        <MenuIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem
            render={<Link to="/profile" />}
            className={cn(profileMatch && activeItemClass)}
          >
            <UserIcon />
            {t('nav.profile')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={onLogout}>
            <LogOutIcon />
            {t('auth.logOut')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
