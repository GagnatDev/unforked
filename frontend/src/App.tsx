import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppNav } from '@/components/AppNav'
import { RequireAuth } from '@/components/RequireAuth'
import { useAuth } from '@/contexts/AuthContext'
import { usePWA } from '@/hooks/usePWA'
import { PWAUpdateBanner } from '@/components/PWAUpdateBanner'
import { PWAInstallBanner } from '@/components/PWAInstallBanner'

const RecipeList = lazy(() => import('./pages/RecipeList'))
const RecipeForm = lazy(() => import('./pages/RecipeForm'))
const MealPlan = lazy(() => import('./pages/MealPlan'))
const Today = lazy(() => import('./pages/Today'))
const ShoppingList = lazy(() => import('./pages/ShoppingList'))
const Family = lazy(() => import('./pages/Family'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const JoinFamily = lazy(() => import('./pages/JoinFamily'))

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
    <div className="max-w-[900px] mx-auto p-6">
      <AppNav onLogout={handleLogout} />
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
          <Route path="/family" element={<Family />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/register-invite" element={<JoinFamily />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}

function App() {
  // PWA update handling lives outside RequireAuth: a stale client whose
  // session has expired must still be able to apply a waiting service-worker
  // update, otherwise it can stay pinned to an old build forever.
  const { needRefresh, updateServiceWorker, canInstall, promptInstall } = usePWA()
  const [updateDismissed, setUpdateDismissed] = useState(false)

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
          onUpdate={() => updateServiceWorker(true)}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}
    </BrowserRouter>
  )
}

export default App
