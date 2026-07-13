import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, MenuIcon } from 'lucide-react'
import { Link, NavLink, useMatch } from 'react-router-dom'
import { UserMenu } from '@/components/UserMenu'
import { OfflineIndicator } from '@/components/OfflineIndicator'
import { buttonVariants } from '@/components/ui/button'
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

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    isActive && 'bg-muted font-medium text-foreground'
  )

const activeItemClass = 'bg-muted font-medium text-foreground'

type AppNavProps = {
  onLogout: () => void
}

export function AppNav({ onLogout }: AppNavProps) {
  const { t } = useTranslation()

  const recipesMatch = useMatch({ path: '/recipes', end: false })
  const todayMatch = useMatch({ path: '/', end: true })
  const mealPlanMatch = useMatch({ path: '/meal-plan', end: false })
  const shoppingMatch = useMatch({ path: '/shopping-list', end: false })

  return (
    <nav className="mb-6 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
      {/* Wide screens: primary navigation stays inline. */}
      <div className="hidden items-center gap-2 sm:flex">
        <NavLink to="/" end className={navLinkClass}>
          {t('nav.today')}
        </NavLink>
        <NavLink to="/meal-plan" className={navLinkClass}>
          {t('nav.weeklyMenu')}
        </NavLink>
        <NavLink to="/shopping-list" className={navLinkClass}>
          {t('nav.shoppingList')}
        </NavLink>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'gap-1 aria-expanded:bg-muted',
              recipesMatch && 'bg-muted font-medium text-foreground'
            )}
          >
            {t('nav.recipesMenu')}
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to="/recipes" />}>
                {t('nav.allRecipes')}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link to="/recipes/new" />}>
                {t('nav.newRecipe')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Narrow screens: primary navigation collapses into a single menu. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('nav.navigation')}
          className={cn(
            buttonVariants({ variant: 'ghost', size: 'icon' }),
            'aria-expanded:bg-muted sm:hidden'
          )}
        >
          <MenuIcon className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <DropdownMenuGroup>
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
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('nav.recipesMenu')}</DropdownMenuLabel>
            <DropdownMenuItem render={<Link to="/recipes" />}>
              {t('nav.allRecipes')}
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to="/recipes/new" />}>
              {t('nav.newRecipe')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="ml-auto flex items-center gap-2">
        <OfflineIndicator />
        <UserMenu onLogout={onLogout} />
      </div>
    </nav>
  )
}
