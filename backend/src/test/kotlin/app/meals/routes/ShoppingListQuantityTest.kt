package app.meals.routes

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

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
}
