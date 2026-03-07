import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import RecipeList from './pages/RecipeList'
import RecipeForm from './pages/RecipeForm'
import MealPlan from './pages/MealPlan'
import ShoppingList from './pages/ShoppingList'

function App() {
  return (
    <BrowserRouter>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
        <nav style={{ marginBottom: 24, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link to="/">Recipes</Link>
          <Link to="/recipes/new">New recipe</Link>
          <Link to="/meal-plan">This week</Link>
          <Link to="/shopping-list">Shopping list</Link>
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
