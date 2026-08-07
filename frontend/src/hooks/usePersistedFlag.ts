import { useCallback, useState } from 'react'
import { readStored, writeStored } from '@/lib/storage'

/**
 * A boolean UI preference remembered across visits under `key` (stored as
 * "1"/"0"). Writes happen when the flag changes, so simply mounting a
 * component never persists a value the user did not choose.
 */
export function usePersistedFlag(
  key: string,
  defaultValue = false,
): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => {
    const stored = readStored(key)
    return stored === null ? defaultValue : stored === '1'
  })

  const set = useCallback(
    (next: boolean) => {
      setValue(next)
      writeStored(key, next ? '1' : '0')
    },
    [key],
  )

  return [value, set]
}
