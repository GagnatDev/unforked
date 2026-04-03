package app.meals.routes

import app.meals.domain.DayAssignment
import app.meals.domain.MealPlanDoc
import app.meals.domain.RecipeDoc
import app.meals.service.ShoppingListService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ShoppingListScalingTest {

    @Test
    fun `scaledIngredientQuantity multiplies numeric quantities`() {
        assertEquals("100", ShoppingListService.scaledIngredientQuantity("200", 0.5))
        assertEquals("200", ShoppingListService.scaledIngredientQuantity("400", 0.5))
        assertEquals("500", ShoppingListService.scaledIngredientQuantity("200", 2.5))
    }

    @Test
    fun `scaledIngredientQuantity handles comma decimals`() {
        assertEquals("1", ShoppingListService.scaledIngredientQuantity("1,5", 2 / 3.0))
    }

    @Test
    fun `scaledIngredientQuantity non-numeric uses ceil scale prefix`() {
        assertEquals("pinch", ShoppingListService.scaledIngredientQuantity("pinch", 0.5))
        assertEquals("2× pinch", ShoppingListService.scaledIngredientQuantity("pinch", 1.1))
        assertEquals("3× pinch", ShoppingListService.scaledIngredientQuantity("pinch", 2.5))
    }

    @Test
    fun `scaledIngredientQuantity blank stays blank`() {
        assertEquals("", ShoppingListService.scaledIngredientQuantity("   ", 2.0))
    }

    @Test
    fun `scaleForAssignment is 1 when no people set`() {
        val plan = MealPlanDoc("2026-W01", defaultPersons = null, assignments = emptyList())
        val a = DayAssignment("monday", "id", "R", persons = null)
        val doc = RecipeDoc("R", servings = 4, ingredients = emptyList())
        assertEquals(1.0, ShoppingListService.scaleForAssignment(plan, a, doc))
    }

    @Test
    fun `scaleForAssignment uses defaultPersons`() {
        val plan = MealPlanDoc("2026-W01", defaultPersons = 2, assignments = emptyList())
        val a = DayAssignment("monday", "id", "R", persons = null)
        val doc = RecipeDoc("R", servings = 4, ingredients = emptyList())
        assertEquals(0.5, ShoppingListService.scaleForAssignment(plan, a, doc))
    }

    @Test
    fun `scaleForAssignment prefers assignment persons override`() {
        val plan = MealPlanDoc("2026-W01", defaultPersons = 4, assignments = emptyList())
        val a = DayAssignment("monday", "id", "R", persons = 2)
        val doc = RecipeDoc("R", servings = 4, ingredients = emptyList())
        assertEquals(0.5, ShoppingListService.scaleForAssignment(plan, a, doc))
    }

    @Test
    fun `scaleForAssignment coerces zero servings to 1`() {
        val plan = MealPlanDoc("2026-W01", defaultPersons = 4, assignments = emptyList())
        val a = DayAssignment("monday", "id", "R", persons = null)
        val doc = RecipeDoc("R", servings = 0, ingredients = emptyList())
        assertEquals(4.0, ShoppingListService.scaleForAssignment(plan, a, doc))
    }
}
