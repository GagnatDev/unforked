import { useTranslation } from 'react-i18next'
import { ChevronDownIcon } from 'lucide-react'
import { Link, NavLink, useMatch } from 'react-router-dom'
import { UserMenu } from '@/components/UserMenu'
import { OfflineIndicator } from '@/components/OfflineIndicator'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    buttonVariants({ variant: 'ghost', size: 'sm' }),
    isActive && 'bg-muted font-medium text-foreground'
  )

type AppNavProps = {
  onLogout: () => void
}

export function AppNav({ onLogout }: AppNavProps) {
  const { t } = useTranslation()

  const recipesMatch = useMatch({ path: '/recipes', end: false })

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
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

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <OfflineIndicator />
        <UserMenu onLogout={onLogout} />
      </div>
    </nav>
  )
}
