package app.meals.domain

import java.time.LocalDate
import java.time.temporal.IsoFields

fun currentWeekIdentifier(): String {
    val now = LocalDate.now()
    val weekNumber = now.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR)
    val year = now.get(IsoFields.WEEK_BASED_YEAR)
    return "%d-W%02d".format(year, weekNumber)
}
