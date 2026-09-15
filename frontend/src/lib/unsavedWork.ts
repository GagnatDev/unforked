/**
 * In-page work that a full page load would destroy — a half-typed recipe, say.
 *
 * Silent re-auth navigates the tab (see `lib/session.ts`), and the durable
 * outbox tells us about *queued* mutations, but nothing else knows that the
 * user is midway through composing something that only exists in component
 * state. A screen holding such work registers it here; re-auth waits for the
 * hold to be released rather than reloading the draft out from under them.
 *
 * Holds are counted, so two screens (or a screen re-registering across a
 * re-render) cannot release each other's claim.
 */
let holds = 0
const listeners = new Set<() => void>()

/** Claim that this screen holds unsaved in-page work. Call the result to release. */
export function holdUnsavedWork(): () => void {
  holds++
  let released = false
  return () => {
    if (released) return
    released = true
    holds--
    if (holds === 0) listeners.forEach((listener) => listener())
  }
}

export function hasUnsavedWork(): boolean {
  return holds > 0
}

/** Notified when the last hold is released — the work is saved or abandoned. */
export function onUnsavedWorkCleared(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function __resetUnsavedWorkForTests(): void {
  holds = 0
  listeners.clear()
}
