package app.meals

import app.meals.importer.IngredientLineParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class IngredientLineParserTest {

    @Test
    fun `norwegian decimal comma and dl`() {
        val ing = IngredientLineParser.parseLine("1,5 dl fin sammalt hvete")
        assertEquals("1,5", ing.quantity)
        assertEquals("dl", ing.unit)
        assertEquals("fin sammalt hvete", ing.name)
    }

    @Test
    fun `norwegian tablespoon abbreviation`() {
        val ing = IngredientLineParser.parseLine("1 ss margarin til steking")
        assertEquals("1", ing.quantity)
        assertEquals("ss", ing.unit)
        assertEquals("margarin til steking", ing.name)
    }

    @Test
    fun `approximate count stk with dotted abbreviation`() {
        val ing = IngredientLineParser.parseLine("ca. 20 stk. maistortilla")
        assertEquals("20", ing.quantity)
        assertEquals("stk", ing.unit)
        assertEquals("ca. maistortilla", ing.name)
    }

    @Test
    fun `english style from json-ld fixtures`() {
        val ing = IngredientLineParser.parseLine("200 g carrots")
        assertEquals("200", ing.quantity)
        assertEquals("g", ing.unit)
        assertEquals("carrots", ing.name)
    }

    @Test
    fun `unrecognized unit keeps full line in name`() {
        val line = "a pinch of salt"
        val ing = IngredientLineParser.parseLine(line)
        assertEquals("", ing.quantity)
        assertEquals("", ing.unit)
        assertEquals(line, ing.name)
    }

    @Test
    fun `no trailing name falls back to full line`() {
        val line = "200 g"
        val ing = IngredientLineParser.parseLine(line)
        assertEquals("", ing.quantity)
        assertEquals("", ing.unit)
        assertEquals(line, ing.name)
    }
}
