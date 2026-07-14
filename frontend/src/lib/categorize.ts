import type { ShoppingCategory } from '@/types'

/**
 * Offline ingredient categorization (offline-first spec A4 / resolved
 * decision 3). A best-effort local heuristic so items added while offline land
 * in a sensible aisle immediately; the server re-categorizes authoritatively on
 * sync (it also applies the family's remembered overrides, which the client
 * does not have offline). The keyword table mirrors the backend's
 * `domain/ingredientCategories.ts` so the local guess usually matches the
 * server's — keep the two in sync when either changes.
 */

/** Normalized ingredient name — the matching key (mirrors the backend). */
export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase()
}

// Norwegian + English keyword table, longest match wins; ties fall to
// definition order (compounds and produce first). Mirrors the backend.
const KEYWORDS: ReadonlyArray<readonly [string, ShoppingCategory]> = [
  // Compounds that must beat their generic tail/head word.
  ['tinned tomatoes', 'pantry'],
  ['hermetiske tomater', 'pantry'],
  ['tomato paste', 'pantry'],
  ['tomatpuré', 'pantry'],
  ['coconut milk', 'pantry'],
  ['kokosmelk', 'pantry'],
  ['peanut butter', 'pantry'],
  ['peanøttsmør', 'pantry'],
  ['soy sauce', 'pantry'],
  ['soyasaus', 'pantry'],
  ['hot sauce', 'pantry'],
  ['curry paste', 'pantry'],
  ['chicken stock', 'pantry'],
  ['refried beans', 'pantry'],
  ['black beans', 'pantry'],
  ['bell pepper', 'produce'],
  ['spring onion', 'produce'],
  ['vårløk', 'produce'],
  ['ice cream', 'frozen'],
  // Produce (before beverages so "lemon" beats "juice" on ties).
  ['tomato', 'produce'],
  ['tomat', 'produce'],
  ['cucumber', 'produce'],
  ['agurk', 'produce'],
  ['onion', 'produce'],
  ['løk', 'produce'],
  ['rødløk', 'produce'],
  ['garlic', 'produce'],
  ['hvitløk', 'produce'],
  ['carrot', 'produce'],
  ['gulrot', 'produce'],
  ['gulrøtter', 'produce'],
  ['celery', 'produce'],
  ['selleri', 'produce'],
  ['potato', 'produce'],
  ['potet', 'produce'],
  ['broccoli', 'produce'],
  ['brokkoli', 'produce'],
  ['cauliflower', 'produce'],
  ['blomkål', 'produce'],
  ['lettuce', 'produce'],
  ['salat', 'produce'],
  ['paprika', 'produce'],
  ['avocado', 'produce'],
  ['avokado', 'produce'],
  ['banana', 'produce'],
  ['banan', 'produce'],
  ['lemon', 'produce'],
  ['sitron', 'produce'],
  ['lime', 'produce'],
  ['apple', 'produce'],
  ['eple', 'produce'],
  ['orange', 'produce'],
  ['appelsin', 'produce'],
  ['basil', 'produce'],
  ['basilikum', 'produce'],
  ['parsley', 'produce'],
  ['persille', 'produce'],
  ['dill', 'produce'],
  ['herb', 'produce'],
  ['urter', 'produce'],
  ['ginger', 'produce'],
  ['ingefær', 'produce'],
  ['mushroom', 'produce'],
  ['sopp', 'produce'],
  ['spinach', 'produce'],
  ['spinat', 'produce'],
  ['pea', 'produce'],
  ['ert', 'produce'],
  ['fruit', 'produce'],
  ['frukt', 'produce'],
  ['kål', 'produce'],
  ['squash', 'produce'],
  // Bakery.
  ['bread', 'bakery'],
  ['brød', 'bakery'],
  ['grovbrød', 'bakery'],
  ['knekkebrød', 'bakery'],
  ['baguette', 'bakery'],
  ['loff', 'bakery'],
  ['bun', 'bakery'],
  ['rundstykke', 'bakery'],
  ['tortilla', 'bakery'],
  ['wrap', 'bakery'],
  ['pita', 'bakery'],
  ['lefse', 'bakery'],
  // Meat.
  ['chicken', 'meat'],
  ['kylling', 'meat'],
  ['beef', 'meat'],
  ['storfe', 'meat'],
  ['minced', 'meat'],
  ['kjøttdeig', 'meat'],
  ['kjøtt', 'meat'],
  ['pork', 'meat'],
  ['svin', 'meat'],
  ['lamb', 'meat'],
  ['lam', 'meat'],
  ['lamme', 'meat'],
  ['bacon', 'meat'],
  ['sausage', 'meat'],
  ['pølse', 'meat'],
  ['ham', 'meat'],
  ['skinke', 'meat'],
  ['turkey', 'meat'],
  ['kalkun', 'meat'],
  // Fish.
  ['fish', 'fish'],
  ['fisk', 'fish'],
  ['salmon', 'fish'],
  ['laks', 'fish'],
  ['tuna', 'fish'],
  ['tunfisk', 'fish'],
  ['cod', 'fish'],
  ['torsk', 'fish'],
  ['shrimp', 'fish'],
  ['reke', 'fish'],
  ['seafood', 'fish'],
  ['sjømat', 'fish'],
  ['makrell', 'fish'],
  ['sild', 'fish'],
  // Dairy & eggs.
  ['milk', 'dairy'],
  ['melk', 'dairy'],
  ['cheese', 'dairy'],
  ['ost', 'dairy'],
  ['parmesan', 'dairy'],
  ['mozzarella', 'dairy'],
  ['cheddar', 'dairy'],
  ['gruyère', 'dairy'],
  ['feta', 'dairy'],
  ['butter', 'dairy'],
  ['smør', 'dairy'],
  ['egg', 'dairy'],
  ['yoghurt', 'dairy'],
  ['yogurt', 'dairy'],
  ['cream', 'dairy'],
  ['fløte', 'dairy'],
  ['rømme', 'dairy'],
  // Frozen.
  ['frozen', 'frozen'],
  ['frossen', 'frozen'],
  ['fryst', 'frozen'],
  ['iskrem', 'frozen'],
  // Pantry / dry goods.
  ['canned', 'pantry'],
  ['hermetisk', 'pantry'],
  ['pasta', 'pantry'],
  ['spaghetti', 'pantry'],
  ['makaroni', 'pantry'],
  ['noodle', 'pantry'],
  ['nudler', 'pantry'],
  ['rice', 'pantry'],
  ['ris', 'pantry'],
  ['flour', 'pantry'],
  ['mel', 'pantry'],
  ['sugar', 'pantry'],
  ['sukker', 'pantry'],
  ['salt', 'pantry'],
  ['pepper', 'pantry'],
  ['oat', 'pantry'],
  ['havregryn', 'pantry'],
  ['oil', 'pantry'],
  ['olje', 'pantry'],
  ['vinegar', 'pantry'],
  ['eddik', 'pantry'],
  ['balsamic', 'pantry'],
  ['stock', 'pantry'],
  ['buljong', 'pantry'],
  ['kraft', 'pantry'],
  ['cumin', 'pantry'],
  ['spisskummen', 'pantry'],
  ['oregano', 'pantry'],
  ['curry', 'pantry'],
  ['krydder', 'pantry'],
  ['spice', 'pantry'],
  ['honey', 'pantry'],
  ['honning', 'pantry'],
  ['syrup', 'pantry'],
  ['sirup', 'pantry'],
  ['mayonnaise', 'pantry'],
  ['majones', 'pantry'],
  ['ketchup', 'pantry'],
  ['mustard', 'pantry'],
  ['sennep', 'pantry'],
  ['sweetcorn', 'pantry'],
  ['mais', 'pantry'],
  ['nut', 'pantry'],
  ['nøtt', 'pantry'],
  ['lentil', 'pantry'],
  ['linse', 'pantry'],
  ['bean', 'pantry'],
  ['bønne', 'pantry'],
  ['chickpea', 'pantry'],
  ['kikert', 'pantry'],
  ['sauce', 'pantry'],
  ['saus', 'pantry'],
  // Beverages.
  ['juice', 'beverages'],
  ['jus', 'beverages'],
  ['coffee', 'beverages'],
  ['kaffe', 'beverages'],
  ['tea', 'beverages'],
  ['te', 'beverages'],
  ['soda', 'beverages'],
  ['brus', 'beverages'],
  ['øl', 'beverages'],
  ['vin', 'beverages'],
  // Household.
  ['paper', 'household'],
  ['papir', 'household'],
  ['tørkerull', 'household'],
  ['dopapir', 'household'],
  ['toilet', 'household'],
  ['soap', 'household'],
  ['såpe', 'household'],
  ['detergent', 'household'],
  ['vaskemiddel', 'household'],
  ['oppvask', 'household'],
  ['foil', 'household'],
  ['folie', 'household'],
]

// Plural-ish endings a short (< 4 char) keyword may leave uncovered in its word:
// "eggs" (egg+s), "tomater" (tomat+er), "erter" (ert+er), "løken" (løk+en).
const ALLOWED_SHORT_SUFFIXES = new Set(['', 's', 'es', 'r', 'er', 'e', 'en', 'et', 'ene'])

const isLetter = (ch: string): boolean => /\p{L}/u.test(ch)

/** True when `keyword` matches `name` at some word start (see KEYWORDS note). */
function keywordMatches(name: string, keyword: string): boolean {
  for (let i = 0; (i = name.indexOf(keyword, i)) !== -1; i += 1) {
    const atWordStart = i === 0 || !isLetter(name[i - 1]!)
    if (!atWordStart) continue
    if (keyword.length >= 4) return true
    let end = i + keyword.length
    let suffix = ''
    while (end < name.length && isLetter(name[end]!)) {
      suffix += name[end]!
      end += 1
    }
    if (ALLOWED_SHORT_SUFFIXES.has(suffix)) return true
  }
  return false
}

/**
 * Best-guess store category for an ingredient name: the longest matching
 * keyword decides; unknown names land in "other". Offline-only — the server's
 * `categorizeIngredient` (with family overrides) is authoritative on sync.
 */
export function categorizeIngredient(name: string): ShoppingCategory {
  const normalized = normalizeIngredientName(name)
  let best: ShoppingCategory | null = null
  let bestLength = 0
  for (const [keyword, category] of KEYWORDS) {
    if (keyword.length > bestLength && keywordMatches(normalized, keyword)) {
      best = category
      bestLength = keyword.length
    }
  }
  return best ?? 'other'
}
