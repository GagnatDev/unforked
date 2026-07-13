import { useTranslation } from 'react-i18next'
import { LogOutIcon, MenuIcon, UserIcon } from 'lucide-react'
import { Link, useMatch } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
 * Hamburger menu with the profile link (settings live there) and logout.
 * On narrow screens it also absorbs the primary navigation, which is hidden
 * inline below the `sm` breakpoint — the whole menu collapses into this single
 * button so mobile shows just one hamburger.
 */
export function UserMenu({ onLogout }: UserMenuProps) {
  const { t } = useTranslation()

  const todayMatch = useMatch({ path: '/', end: true })
  const mealPlanMatch = useMatch({ path: '/meal-plan', end: false })
  const shoppingMatch = useMatch({ path: '/shopping-list', end: false })
  const recipesMatch = useMatch({ path: '/recipes', end: false })

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
        {/* Primary navigation: only shown while the inline nav is collapsed. */}
        <DropdownMenuGroup className="sm:hidden">
          <DropdownMenuItem
            render={<Link to="/" />}
            className={cn(todayMatch && activeItemClass)}
          >
            {t('nav.today')}
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link to="/meal-plan" />}
            className={cn(mealPlanMatch && activeItemClass)}
          >
            {t('nav.weeklyMenu')}
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link to="/shopping-list" />}
            className={cn(shoppingMatch && activeItemClass)}
          >
            {t('nav.shoppingList')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="sm:hidden" />
        <DropdownMenuGroup className="sm:hidden">
          <DropdownMenuLabel className={cn(recipesMatch && 'text-foreground')}>
            {t('nav.recipesMenu')}
          </DropdownMenuLabel>
          <DropdownMenuItem render={<Link to="/recipes" />}>
            {t('nav.allRecipes')}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link to="/recipes/new" />}>
            {t('nav.newRecipe')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="sm:hidden" />

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
