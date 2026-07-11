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
const JoinFamily = lazy(() => import('./pages/JoinFamily'))

function AppLayout() {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const { needRefresh, updateServiceWorker, canInstall, promptInstall } = usePWA()
  const [updateDismissed, setUpdateDismissed] = useState(false)

  const handleLogout = () => {
    void logout()
  }

  return (
    <div className="max-w-[900px] mx-auto p-6">
      <AppNav onLogout={handleLogout} />
      {canInstall && <PWAInstallBanner onInstall={promptInstall} />}
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
          <Route path="/register-invite" element={<JoinFamily />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {needRefresh && !updateDismissed && (
        <PWAUpdateBanner
          onUpdate={() => updateServiceWorker(true)}
          onDismiss={() => setUpdateDismissed(true)}
        />
      )}
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
