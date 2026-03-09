import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { buttonVariants } from '@/components/ui/button'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { RequireAuth } from '@/components/RequireAuth'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import RecipeList from './pages/RecipeList'
import RecipeForm from './pages/RecipeForm'
import MealPlan from './pages/MealPlan'
import ShoppingList from './pages/ShoppingList'
import Login from './pages/Login'
import Users from './pages/Users'

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
          {t('nav.thisWeek')}
        </Link>
        <Link to="/shopping-list" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
          {t('nav.shoppingList')}
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
      <Routes>
        <Route path="/" element={<RecipeList />} />
        <Route path="/recipes/new" element={<RecipeForm />} />
        <Route path="/recipes/:id/edit" element={<RecipeForm />} />
        <Route path="/meal-plan" element={<MealPlan />} />
        <Route path="/shopping-list" element={<ShoppingList />} />
        <Route path="/users" element={<Users />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
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
