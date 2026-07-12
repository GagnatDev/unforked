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

type UserMenuProps = {
  onLogout: () => void
}

/** Hamburger menu with a link to the profile page (settings live there) and logout. */
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
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/profile" />}>
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
