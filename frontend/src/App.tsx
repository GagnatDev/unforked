import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { buttonVariants } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { RequireAuth } from '@/components/RequireAuth'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import Login from './pages/Login'

const RecipeList = lazy(() => import('./pages/RecipeList'))
const RecipeForm = lazy(() => import('./pages/RecipeForm'))
const MealPlan = lazy(() => import('./pages/MealPlan'))
const ShoppingList = lazy(() => import('./pages/ShoppingList'))
const Users = lazy(() => import('./pages/Users'))
const Family = lazy(() => import('./pages/Family'))
const RegisterInvite = lazy(() => import('./pages/RegisterInvite'))

function AppLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, logout, authDisabled } = useAuth()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="max-w-[900px] mx-auto p-6">
      <nav className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
        <Link to="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          {t('nav.recipes')}
        </Link>
        <Link to="/recipes/new" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          {t('nav.newRecipe')}
        </Link>
        <Link to="/meal-plan" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          {t('nav.weeklyMenu')}
        </Link>
        <Link to="/shopping-list" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          {t('nav.shoppingList')}
        </Link>
        <Link to="/family" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          {t('nav.family')}
        </Link>
        {!authDisabled && user?.role === 'admin' && (
          <Link to="/users" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            {t('nav.users')}
          </Link>
        )}
        <span className="ml-auto flex items-center gap-2">
          {!authDisabled && (
            <button
              type="button"
              onClick={handleLogout}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
            >
              {t('auth.logOut')}
            </button>
          )}
          <LanguageSwitcher />
          <ThemeToggle />
        </span>
      </nav>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground" role="status">
            {t('common.loading')}
          </p>
        }
      >
        <Routes>
          <Route path="/" element={<RecipeList />} />
          <Route path="/recipes/new" element={<RecipeForm />} />
          <Route path="/recipes/:id/edit" element={<RecipeForm />} />
          <Route path="/meal-plan" element={<MealPlan />} />
          <Route path="/shopping-list" element={<ShoppingList />} />
          <Route path="/users" element={<Users />} />
          <Route path="/family" element={<Family />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register-invite" element={<RegisterInvite />} />
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
