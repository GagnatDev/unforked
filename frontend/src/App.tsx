import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import RecipeList from './pages/RecipeList'
import RecipeForm from './pages/RecipeForm'
import MealPlan from './pages/MealPlan'
import ShoppingList from './pages/ShoppingList'

function App() {
  return (
    <BrowserRouter>
      <div className="max-w-[900px] mx-auto p-6">
        <nav className="mb-6 flex flex-wrap gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <Link to="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Recipes
          </Link>
          <Link to="/recipes/new" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            New recipe
          </Link>
          <Link to="/meal-plan" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            This week
          </Link>
          <Link to="/shopping-list" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}>
            Shopping list
          </Link>
        </nav>
        <Routes>
          <Route path="/" element={<RecipeList />} />
          <Route path="/recipes/new" element={<RecipeForm />} />
          <Route path="/recipes/:id/edit" element={<RecipeForm />} />
          <Route path="/meal-plan" element={<MealPlan />} />
          <Route path="/shopping-list" element={<ShoppingList />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
