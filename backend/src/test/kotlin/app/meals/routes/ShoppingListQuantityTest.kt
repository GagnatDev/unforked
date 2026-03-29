package app.meals.routes

import app.meals.domain.DayAssignment
import app.meals.domain.Ingredient
import app.meals.domain.MealPlanDoc
import app.meals.domain.RecipeDoc
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import java.util.UUID

class ShoppingListQuantityTest {

    @Test
    fun `summarizeQuantities sums numeric quantities`() {
        assertEquals("500", summarizeQuantities(listOf("200", "300")))
        assertEquals("400", summarizeQuantities(listOf("200", "200")))
        assertEquals("3", summarizeQuantities(listOf("1", "1", "1")))
    }

    @Test
    fun `summarizeQuantities sums decimals`() {
        assertEquals("2.5", summarizeQuantities(listOf("1", "1.5")))
        assertEquals("1.5", summarizeQuantities(listOf("0.5", "1")))
    }

    @Test
    fun `summarizeQuantities accepts comma as decimal separator`() {
        assertEquals("2.5", summarizeQuantities(listOf("1,5", "1")))
    }

    @Test
    fun `summarizeQuantities joins non-numeric quantities`() {
        assertEquals("pinch, handful", summarizeQuantities(listOf("pinch", "handful")))
        assertEquals("some", summarizeQuantities(listOf("some", "some")))
    }

    @Test
    fun `summarizeQuantities joins when mixed numeric and non-numeric`() {
        assertEquals("200, some", summarizeQuantities(listOf("200", "some")))
    }

    @Test
    fun `summarizeQuantities returns dash for empty list`() {
        assertEquals("—", summarizeQuantities(emptyList()))
    }

    @Test
    fun `summarizeQuantities formats whole numbers without decimal`() {
        assertEquals("3", summarizeQuantities(listOf("1.5", "1.5")))
    }

    @Test
    fun `buildAggregatedShoppingItems merges g and kg for same ingredient`() {
        val id1 = UUID.randomUUID()
        val id2 = UUID.randomUUID()
        val r1 = RecipeDoc(
            name = "A",
            ingredients = listOf(Ingredient("flour", "200", "g")),
        )
        val r2 = RecipeDoc(
            name = "B",
            ingredients = listOf(Ingredient("flour", "0.5", "kg")),
        )
        val plan = MealPlanDoc(
            weekIdentifier = "2026-W01",
            assignments = listOf(
                DayAssignment("monday", id1.toString(), "A"),
                DayAssignment("tuesday", id2.toString(), "B"),
            ),
        )
        val map = mapOf(
            id1.toString() to (id1 to r1),
            id2.toString() to (id2 to r2),
        )
        val flour = buildAggregatedShoppingItems(plan, map).find { it.name.equals("flour", ignoreCase = true) }
        assertNotNull(flour)
        assertEquals("700", flour!!.quantity)
        assertEquals("g", flour.unit)
    }

    @Test
    fun `buildAggregatedShoppingItems merges dl and l for same ingredient`() {
        val id1 = UUID.randomUUID()
        val id2 = UUID.randomUUID()
        val r1 = RecipeDoc(
            name = "A",
            ingredients = listOf(Ingredient("milk", "2", "dl")),
        )
        val r2 = RecipeDoc(
            name = "B",
            ingredients = listOf(Ingredient("milk", "1", "l")),
        )
        val plan = MealPlanDoc(
            weekIdentifier = "2026-W01",
            assignments = listOf(
                DayAssignment("monday", id1.toString(), "A"),
                DayAssignment("tuesday", id2.toString(), "B"),
            ),
        )
        val map = mapOf(
            id1.toString() to (id1 to r1),
            id2.toString() to (id2 to r2),
        )
        val milk = buildAggregatedShoppingItems(plan, map).find { it.name.equals("milk", ignoreCase = true) }
        assertNotNull(milk)
        assertEquals("1.2", milk!!.quantity)
        assertEquals("l", milk.unit)
    }

    @Test
    fun `buildAggregatedShoppingItems merges tsp and tbsp`() {
        val id1 = UUID.randomUUID()
        val id2 = UUID.randomUUID()
        val r1 = RecipeDoc(name = "A", ingredients = listOf(Ingredient("vanilla", "1", "tsp")))
        val r2 = RecipeDoc(name = "B", ingredients = listOf(Ingredient("vanilla", "1", "tbsp")))
        val plan = MealPlanDoc(
            weekIdentifier = "2026-W01",
            assignments = listOf(
                DayAssignment("monday", id1.toString(), "A"),
                DayAssignment("tuesday", id2.toString(), "B"),
            ),
        )
        val map = mapOf(
            id1.toString() to (id1 to r1),
            id2.toString() to (id2 to r2),
        )
        val item = buildAggregatedShoppingItems(plan, map).find { it.name.equals("vanilla", ignoreCase = true) }
        assertNotNull(item)
        assertEquals("20", item!!.quantity)
        assertEquals("ml", item.unit)
    }

    @Test
    fun `buildAggregatedShoppingItems merges Norwegian ts and ss`() {
        val id1 = UUID.randomUUID()
        val id2 = UUID.randomUUID()
        val r1 = RecipeDoc(name = "A", ingredients = listOf(Ingredient("salt", "1", "ts")))
        val r2 = RecipeDoc(name = "B", ingredients = listOf(Ingredient("salt", "1", "ss")))
        val plan = MealPlanDoc(
            weekIdentifier = "2026-W01",
            assignments = listOf(
                DayAssignment("monday", id1.toString(), "A"),
                DayAssignment("tuesday", id2.toString(), "B"),
            ),
        )
        val map = mapOf(
            id1.toString() to (id1 to r1),
            id2.toString() to (id2 to r2),
        )
        val item = buildAggregatedShoppingItems(plan, map).find { it.name.equals("salt", ignoreCase = true) }
        assertNotNull(item)
        assertEquals("20", item!!.quantity)
        assertEquals("ml", item.unit)
    }

    @Test
    fun `buildAggregatedShoppingItems keeps handful separate from weight grams`() {
        val id1 = UUID.randomUUID()
        val id2 = UUID.randomUUID()
        val r1 = RecipeDoc(name = "A", ingredients = listOf(Ingredient("basil", "100", "g")))
        val r2 = RecipeDoc(name = "B", ingredients = listOf(Ingredient("basil", "1", "handful")))
        val plan = MealPlanDoc(
            weekIdentifier = "2026-W01",
            assignments = listOf(
                DayAssignment("monday", id1.toString(), "A"),
                DayAssignment("tuesday", id2.toString(), "B"),
            ),
        )
        val map = mapOf(
            id1.toString() to (id1 to r1),
            id2.toString() to (id2 to r2),
        )
        val items = buildAggregatedShoppingItems(plan, map).filter { it.name.equals("basil", ignoreCase = true) }
        assertEquals(2, items.size)
    }
}
