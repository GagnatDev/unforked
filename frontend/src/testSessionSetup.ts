import { beforeEach } from 'vitest'
import { __resetLocalSessionForTests } from '@/lib/localSession'

// Domain-only suites deliberately omit AuthProvider. Give their API fixtures an
// explicit live session; auth integration suites reset this to checking and
// exercise the real provider, owner binding and verification instead.
beforeEach(() => { __resetLocalSessionForTests('live') })
