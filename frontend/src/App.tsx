import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BottomNav } from '@/components/BottomNav'
import { TopBar } from '@/components/TopBar'
import { RequireAuth } from '@/components/RequireAuth'
import { RequireLiveSession } from '@/components/RequireLiveSession'
import { useAuth } from '@/contexts/AuthContext'
import { useForegroundResume, usePWA } from '@/hooks/usePWA'
import { PWAUpdateBanner } from '@/components/PWAUpdateBanner'
import { PWAInstallBanner } from '@/components/PWAInstallBanner'
import { PushToaster } from '@/components/PushToaster'

const RecipeList = lazy(() => import('./pages/RecipeList'))
const RecipeForm = lazy(() => import('./pages/RecipeForm'))
const MealPlan = lazy(() => import('./pages/MealPlan'))
const Today = lazy(() => import('./pages/Today'))
const ShoppingList = lazy(() => import('./pages/ShoppingList'))
const Family = lazy(() => import('./pages/Family'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const JoinFamily = lazy(() => import('./pages/JoinFamily'))
const Profile = lazy(() => import('./pages/Profile'))

function AppLayout({
  canInstall,
  onInstall,
}: {
  canInstall: boolean
  onInstall: () => void
}) {
  const { t } = useTranslation()
  const { logout } = useAuth()

  const handleLogout = () => {
    void logout()
  }

  return (
    // Room at the bottom for the floating tab bar, so the last row of a list
    // is never parked underneath it.
    <div className="mx-auto max-w-[900px] px-4 pt-4 pb-32 sm:px-6">
      <TopBar onLogout={handleLogout} />
      {/* Focused-window pushes surface in-page (design #104 D6/phase 5). */}
      <PushToaster />
      {canInstall && <PWAInstallBanner onInstall={onInstall} />}
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground" role="status">
            {t('common.loading')}
          </p>
        }
      >
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/today" element={<Navigate to="/" replace />} />
          <Route path="/recipes" element={<RecipeList />} />
          <Route path="/recipes/new" element={<RecipeForm />} />
          <Route path="/recipes/:id/edit" element={<RecipeForm />} />
          <Route path="/meal-plan" element={<MealPlan />} />
          <Route path="/shopping-list" element={<ShoppingList />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/family" element={<RequireLiveSession titleKey="family.title"><Family /></RequireLiveSession>} />
          <Route path="/api-keys" element={<RequireLiveSession titleKey="apiKeys.title"><ApiKeys /></RequireLiveSession>} />
          <Route path="/register-invite" element={<RequireLiveSession><JoinFamily /></RequireLiveSession>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <BottomNav />
    </div>
  )
}

/**
 * Dismissing the update banner snoozes it until the next time the app is
 * properly reopened, not forever: an installed app is resumed rather than
 * reloaded, so "for this page" can mean weeks of running an old build.
 */
const UPDATE_SNOOZE_MS = 30 * 60 * 1000

function App() {
  // PWA update handling lives outside RequireAuth: a stale client whose
  // session has expired must still be able to apply a waiting service-worker
  // update, otherwise it can stay pinned to an old build forever.
  const { needRefresh, applyUpdate, canInstall, promptInstall } = usePWA()
  const [updateDismissed, setUpdateDismissed] = useState(false)
  useForegroundResume(() => setUpdateDismissed(false), UPDATE_SNOOZE_MS)

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppLayout canInstall={canInstall} onInstall={promptInstall} />
            </RequireAuth>
          }
        />
      </Routes>
      {needRefresh && !updateDismissed && (
        <PWAUpdateBanner
          onUpdate={applyUpdate}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}
    </BrowserRouter>
  )
}

export default App
