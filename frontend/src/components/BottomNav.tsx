import { useTranslation } from 'react-i18next'
import {
  BookOpenIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ShoppingCartIcon,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

type Tab = {
  to: string
  end?: boolean
  labelKey: string
  Icon: typeof CalendarCheckIcon
}

/**
 * The app's four destinations, on a bar that stays under the thumb.
 *
 * Navigation only — no centre "add" button. The add actions are unequal and
 * screen-specific (an item goes on the shopping list where you can see where it
 * lands; a recipe is captured from the recipe library), so each lives on the
 * screen it belongs to rather than changing meaning under the thumb.
 */
const TABS: Tab[] = [
  { to: '/', end: true, labelKey: 'nav.today', Icon: CalendarCheckIcon },
  { to: '/meal-plan', labelKey: 'nav.weeklyMenu', Icon: CalendarDaysIcon },
  { to: '/shopping-list', labelKey: 'nav.shoppingList', Icon: ShoppingCartIcon },
  { to: '/recipes', labelKey: 'nav.recipes', Icon: BookOpenIcon },
]

export function BottomNav() {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('nav.menu')}
      // Floats over the page, inside the same max-width as the content so it
      // does not stretch across a desktop window.
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <ul className="mx-auto grid max-w-[560px] list-none grid-cols-4 gap-1 rounded-2xl bg-nav p-1 ring-1 ring-nav-foreground/10 shadow-[0_10px_26px_-8px_oklch(0.30_0.04_167/0.45)]">
        {TABS.map(({ to, end, labelKey, Icon }) => (
          <li key={to} className="contents">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-nav-muted-foreground no-underline transition-colors',
                  'hover:text-nav-foreground hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nav-accent',
                  isActive && 'bg-white/10 text-nav-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn('size-5 shrink-0', isActive && 'text-nav-accent')}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  <span className="text-[0.6875rem] leading-none font-medium">
                    {t(labelKey)}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
