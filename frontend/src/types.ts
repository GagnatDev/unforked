export interface Ingredient {
  name: string
  quantity: string
  unit: string
}

export interface RecipeDoc {
  name: string
  description: string
  ingredients: Ingredient[]
  steps: string[]
  servings: number
  tags: string[]
}

export interface Recipe {
  id: string
  doc: RecipeDoc
}

export interface DayAssignment {
  day: string
  recipeId: string
  recipeName: string
}

export interface MealPlanDoc {
  weekIdentifier: string
  assignments: DayAssignment[]
}

export interface ShoppingListItem {
  name: string
  quantity: string
  unit: string
  recipeIds: string[]
}

export interface ShoppingListDoc {
  weekIdentifier: string
  items: ShoppingListItem[]
}
