import { useEffect, useState } from 'react'

import { getCurrentWeekId, getNextWeekId } from '@/lib/utils'
import { getLocalShoppingList } from '@/local/db'
import { useLocal } from '@/local/useLocal'

export type UseShoppingWeekResult = {
  /** The week whose list the page should render. */
  weekId: string
  /** True while the week is still being decided — render as loading. */
  resolving: boolean
}

/**
 * Which week the shopping list opens on.
 *
 * A week pinned in `?week=` always wins (push-notification deep links, or a
 * week picked in the strip). Without a pin the page opens on next week — the
 * week you shop for — unless next week's list turns out to be empty: nothing
 * has been planned for it yet, so the useful list is this week's, the one
 * still being shopped.
 *
 * Emptiness is read from the local store, not the network: the page's own
 * `useShoppingList(weekId)` pulls next week and writes it there, and `useLocal`
 * re-reads on that write — so the fallback costs no extra request. Until the
 * week is known locally the page stays on next week (and shows its loading or
 * error state as before). The fallback is decided once per visit, so a later
 * pull that fills next week in doesn't pull the list out from under whoever is
 * shopping.
 */
export function useShoppingWeek(pinnedWeek: string | null): UseShoppingWeekResult {
  const [fellBack, setFellBack] = useState(false)
  const nextWeek = getNextWeekId()
  // Only look while the answer can still change which week is rendered.
  const undecided = pinnedWeek == null && !fellBack
  const { data: doc } = useLocal(
    () => getLocalShoppingList(nextWeek),
    ['shoppingLists'],
    [nextWeek],
    { enabled: undecided },
  )

  const nextWeekEmpty = undecided && doc != null && doc.items.length === 0
  useEffect(() => {
    if (nextWeekEmpty) setFellBack(true)
  }, [nextWeekEmpty])

  return {
    weekId: pinnedWeek ?? (fellBack ? getCurrentWeekId() : nextWeek),
    // The switch lands in the effect above; keep next week's empty list from
    // flashing in the render before it.
    resolving: nextWeekEmpty,
  }
}
