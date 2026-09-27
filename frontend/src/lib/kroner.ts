/**
 * Read an amount in kroner as people type it off a receipt: "349", "1 249,50",
 * "1249.5", "kr 349", "349,-". Whitespace and a trailing "kr"/",-" are
 * ignored; either comma or dot is the decimal mark. Returns null for anything
 * that is not a single non-negative amount (including the empty string).
 */
export function parseKroner(input: string): number | null {
  const cleaned = input
    .replace(/kr\.?/gi, '')
    .replace(/,-\s*$/, '')
    .replace(/\s+/g, '')
  if (!/^\d+([.,]\d{1,2})?$/.test(cleaned)) return null
  const value = Number(cleaned.replace(',', '.'))
  return Number.isFinite(value) ? value : null
}

/** The amount as an editable string — dot decimal, no thousands separators. */
export function kronerInputValue(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}
