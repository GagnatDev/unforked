package app.meals.seed

import app.meals.domain.Ingredient
import app.meals.domain.RecipeDoc
import app.meals.storage.FamilyRepository
import app.meals.storage.RecipeRepository

private val testRecipes = listOf(
    RecipeDoc(
        name = "Tomato Pasta",
        description = "Simple weeknight pasta with fresh tomatoes and basil.",
        ingredients = listOf(
            Ingredient("spaghetti", "400", "g"),
            Ingredient("cherry tomatoes", "300", "g"),
            Ingredient("garlic", "2", "cloves"),
            Ingredient("olive oil", "2", "tbsp"),
            Ingredient("basil", "1", "handful"),
            Ingredient("parmesan", "50", "g"),
        ),
        steps = listOf(
            "Cook pasta in salted boiling water until al dente. Reserve 1 cup pasta water.",
            "Halve tomatoes. Finely chop garlic and basil.",
            "Heat oil in a large pan, add garlic until fragrant. Add tomatoes, season, cook 2–3 min.",
            "Toss in drained pasta, a splash of pasta water, and basil. Serve with parmesan.",
        ),
        servings = 4,
        tags = listOf("pasta", "vegetarian", "quick"),
    ),
    RecipeDoc(
        name = "Lentil Soup",
        description = "Hearty red lentil soup with vegetables and cumin.",
        ingredients = listOf(
            Ingredient("red lentils", "200", "g"),
            Ingredient("onion", "1", "medium"),
            Ingredient("carrot", "2", "medium"),
            Ingredient("celery", "2", "stalks"),
            Ingredient("cumin", "1", "tsp"),
            Ingredient("vegetable stock", "1", "L"),
            Ingredient("lemon juice", "1", "tbsp"),
        ),
        steps = listOf(
            "Rinse lentils. Dice onion, carrot, and celery.",
            "Sauté onion, carrot, celery in a little oil until soft. Add cumin and stir 1 min.",
            "Add lentils and stock. Bring to a boil, simmer 20–25 min until lentils are tender.",
            "Blend half if you like it creamy. Stir in lemon juice and season to taste.",
        ),
        servings = 4,
        tags = listOf("soup", "vegetarian", "vegan"),
    ),
    RecipeDoc(
        name = "Omelette with Herbs",
        description = "Fluffy omelette with mixed herbs and optional cheese.",
        ingredients = listOf(
            Ingredient("eggs", "3", ""),
            Ingredient("milk", "1", "tbsp"),
            Ingredient("mixed herbs", "1", "tbsp"),
            Ingredient("butter", "15", "g"),
            Ingredient("grated cheese", "30", "g"),
        ),
        steps = listOf(
            "Beat eggs with milk, herbs, salt and pepper.",
            "Melt butter in a non-stick pan over medium heat. Pour in egg mix.",
            "When edges set, add cheese on one half. Fold and slide onto a plate.",
        ),
        servings = 1,
        tags = listOf("breakfast", "vegetarian", "quick"),
    ),
    RecipeDoc(
        name = "Chickpea Salad",
        description = "Fresh chickpea and vegetable salad with a lemon dressing.",
        ingredients = listOf(
            Ingredient("canned chickpeas", "400", "g"),
            Ingredient("cucumber", "1", "small"),
            Ingredient("tomato", "2", "medium"),
            Ingredient("red onion", "0.5", ""),
            Ingredient("parsley", "0.5", "bunch"),
            Ingredient("olive oil", "2", "tbsp"),
            Ingredient("lemon juice", "1", "tbsp"),
        ),
        steps = listOf(
            "Drain and rinse chickpeas. Dice cucumber, tomato, and onion. Chop parsley.",
            "Mix olive oil, lemon juice, salt and pepper for the dressing.",
            "Combine chickpeas and vegetables in a bowl, toss with dressing and parsley.",
        ),
        servings = 2,
        tags = listOf("salad", "vegan", "quick"),
    ),
    RecipeDoc(
        name = "Rice and Black Beans",
        description = "Simple rice and black beans with onion and spices.",
        ingredients = listOf(
            Ingredient("long-grain rice", "200", "g"),
            Ingredient("black beans", "400", "g can"),
            Ingredient("onion", "1", "medium"),
            Ingredient("cumin", "0.5", "tsp"),
            Ingredient("paprika", "0.5", "tsp"),
            Ingredient("stock or water", "400", "ml"),
        ),
        steps = listOf(
            "Rinse rice. Drain beans. Dice onion.",
            "Sauté onion until soft. Add cumin and paprika, stir 1 min.",
            "Add rice, stock, and beans. Bring to a boil, cover, simmer 18–20 min. Fluff and serve.",
        ),
        servings = 3,
        tags = listOf("vegan", "one-pot"),
    ),
    RecipeDoc(
        name = "Grilled Cheese",
        description = "Crispy bread with melted cheese.",
        ingredients = listOf(
            Ingredient("bread slices", "2", ""),
            Ingredient("cheddar or gruyère", "50", "g"),
            Ingredient("butter", "15", "g"),
        ),
        steps = listOf(
            "Butter one side of each bread slice. Place cheese between unbuttered sides.",
            "Fry in a pan over medium heat until golden on both sides and cheese melts.",
        ),
        servings = 1,
        tags = listOf("quick", "vegetarian"),
    ),
    RecipeDoc(
        name = "Avocado Toast",
        description = "Mashed avocado on toasted bread with lemon and salt.",
        ingredients = listOf(
            Ingredient("bread", "2", "slices"),
            Ingredient("ripe avocado", "1", ""),
            Ingredient("lemon juice", "0.5", ""),
            Ingredient("salt and pepper", "", ""),
        ),
        steps = listOf(
            "Toast bread. Mash avocado with lemon juice, salt and pepper.",
            "Spread on toast. Add optional chilli flakes or seeds.",
        ),
        servings = 1,
        tags = listOf("breakfast", "vegan", "quick"),
    ),
    RecipeDoc(
        name = "Oatmeal with Banana",
        description = "Creamy oats with sliced banana.",
        ingredients = listOf(
            Ingredient("rolled oats", "50", "g"),
            Ingredient("water or milk", "200", "ml"),
            Ingredient("banana", "1", ""),
            Ingredient("honey or maple syrup", "1", "tbsp"),
        ),
        steps = listOf(
            "Cook oats in water or milk according to package (about 5 min).",
            "Slice banana on top, drizzle with honey or syrup.",
        ),
        servings = 1,
        tags = listOf("breakfast", "vegetarian", "quick"),
    ),
    RecipeDoc(
        name = "Cucumber Salad",
        description = "Sliced cucumber with dill and vinegar.",
        ingredients = listOf(
            Ingredient("cucumber", "2", "medium"),
            Ingredient("dill", "2", "tbsp"),
            Ingredient("white vinegar", "1", "tbsp"),
            Ingredient("sugar", "0.5", "tsp"),
            Ingredient("salt", "pinch", ""),
        ),
        steps = listOf(
            "Thinly slice cucumber. Chop dill.",
            "Mix vinegar, sugar, salt. Toss with cucumber and dill. Chill briefly.",
        ),
        servings = 2,
        tags = listOf("salad", "vegan", "quick"),
    ),
    RecipeDoc(
        name = "Garlic Bread",
        description = "Toasted bread with garlic butter.",
        ingredients = listOf(
            Ingredient("baguette or bread", "0.5", ""),
            Ingredient("butter", "40", "g"),
            Ingredient("garlic", "2", "cloves"),
            Ingredient("parsley", "1", "tbsp"),
        ),
        steps = listOf(
            "Mix soft butter with minced garlic and chopped parsley.",
            "Slice bread, spread butter on cut sides. Bake at 200°C until golden (about 8 min).",
        ),
        servings = 2,
        tags = listOf("vegetarian", "quick"),
    ),
    RecipeDoc(
        name = "Bean Tacos",
        description = "Soft tacos with refried beans and fresh toppings.",
        ingredients = listOf(
            Ingredient("soft tortillas", "6", ""),
            Ingredient("refried beans", "400", "g can"),
            Ingredient("lettuce", "2", "handfuls"),
            Ingredient("tomato", "1", "diced"),
            Ingredient("lime", "1", ""),
            Ingredient("hot sauce", "", ""),
        ),
        steps = listOf(
            "Warm tortillas. Heat beans in a small pan.",
            "Fill tortillas with beans, lettuce, tomato. Squeeze lime and add hot sauce.",
        ),
        servings = 2,
        tags = listOf("vegan", "quick"),
    ),
    RecipeDoc(
        name = "Tomato and Mozzarella Salad",
        description = "Caprese-style salad with tomato, mozzarella and basil.",
        ingredients = listOf(
            Ingredient("tomatoes", "3", "medium"),
            Ingredient("mozzarella", "150", "g"),
            Ingredient("basil", "1", "handful"),
            Ingredient("olive oil", "2", "tbsp"),
            Ingredient("balsamic", "1", "tsp"),
        ),
        steps = listOf(
            "Slice tomatoes and mozzarella. Arrange on a plate with basil leaves.",
            "Drizzle with olive oil and balsamic. Season with salt and pepper.",
        ),
        servings = 2,
        tags = listOf("salad", "vegetarian", "quick"),
    ),
    RecipeDoc(
        name = "Scrambled Eggs",
        description = "Creamy scrambled eggs on toast.",
        ingredients = listOf(
            Ingredient("eggs", "3", ""),
            Ingredient("butter", "15", "g"),
            Ingredient("bread", "2", "slices"),
            Ingredient("salt and pepper", "", ""),
        ),
        steps = listOf(
            "Beat eggs with salt and pepper. Melt butter in a non-stick pan over low heat.",
            "Add eggs and stir gently until just set. Serve on toast.",
        ),
        servings = 1,
        tags = listOf("breakfast", "vegetarian", "quick"),
    ),
    RecipeDoc(
        name = "Peanut Butter Banana Sandwich",
        description = "Peanut butter and banana between bread.",
        ingredients = listOf(
            Ingredient("bread", "2", "slices"),
            Ingredient("peanut butter", "2", "tbsp"),
            Ingredient("banana", "1", ""),
        ),
        steps = listOf(
            "Toast bread if desired. Spread peanut butter on both slices.",
            "Slice banana and layer on one slice. Close sandwich and cut in half.",
        ),
        servings = 1,
        tags = listOf("breakfast", "vegetarian", "quick"),
    ),
    RecipeDoc(
        name = "Tuna and Sweetcorn Wrap",
        description = "Tuna, sweetcorn and mayo in a soft wrap.",
        ingredients = listOf(
            Ingredient("tuna in water", "1", "small can"),
            Ingredient("sweetcorn", "3", "tbsp"),
            Ingredient("mayonnaise", "1", "tbsp"),
            Ingredient("large wrap", "1", ""),
            Ingredient("lettuce", "2", "leaves"),
        ),
        steps = listOf(
            "Drain tuna. Mix with sweetcorn and mayonnaise.",
            "Lay wrap flat, add lettuce and tuna mix. Roll up and serve.",
        ),
        servings = 1,
        tags = listOf("quick"),
    ),
    RecipeDoc(
        name = "Mug Omelette",
        description = "Single-serving omelette made in a mug in the microwave.",
        ingredients = listOf(
            Ingredient("eggs", "2", ""),
            Ingredient("milk", "1", "tbsp"),
            Ingredient("grated cheese", "2", "tbsp"),
            Ingredient("salt and pepper", "", ""),
        ),
        steps = listOf(
            "Beat eggs, milk, salt and pepper in a large microwave-safe mug.",
            "Microwave 1 min, stir, add cheese, microwave 30–60 sec until set.",
        ),
        servings = 1,
        tags = listOf("breakfast", "vegetarian", "quick"),
    ),
    RecipeDoc(
        name = "Chicken Stir-Fry",
        description = "Quick chicken and vegetable stir-fry with soy and ginger.",
        ingredients = listOf(
            Ingredient("chicken breast", "400", "g"),
            Ingredient("broccoli", "200", "g"),
            Ingredient("bell pepper", "1", ""),
            Ingredient("soy sauce", "2", "tbsp"),
            Ingredient("ginger", "1", "thumb"),
            Ingredient("garlic", "2", "cloves"),
            Ingredient("vegetable oil", "2", "tbsp"),
            Ingredient("rice", "300", "g cooked"),
        ),
        steps = listOf(
            "Slice chicken into strips. Cut broccoli into florets, pepper into strips. Grate ginger, mince garlic.",
            "Heat oil in a wok or large pan. Stir-fry chicken until golden, set aside. Stir-fry vegetables 3–4 min.",
            "Return chicken, add soy sauce and garlic. Toss 1 min. Serve over rice.",
        ),
        servings = 4,
        tags = listOf("dinner", "stir-fry"),
    ),
    RecipeDoc(
        name = "Baked Salmon with Lemon and Dill",
        description = "Oven-baked salmon fillets with lemon, dill and olive oil.",
        ingredients = listOf(
            Ingredient("salmon fillets", "4", "approx 150g each"),
            Ingredient("lemon", "1", ""),
            Ingredient("fresh dill", "2", "tbsp"),
            Ingredient("olive oil", "2", "tbsp"),
            Ingredient("garlic", "1", "clove"),
            Ingredient("salt and pepper", "", ""),
        ),
        steps = listOf(
            "Place salmon on a lined baking tray. Drizzle with oil, season, top with sliced lemon and dill.",
            "Bake at 200°C for 12–15 min until opaque and flaky. Serve with extra lemon.",
        ),
        servings = 4,
        tags = listOf("dinner", "fish"),
    ),
    RecipeDoc(
        name = "Spaghetti Bolognese",
        description = "Classic beef and tomato sauce with spaghetti.",
        ingredients = listOf(
            Ingredient("minced beef", "500", "g"),
            Ingredient("spaghetti", "400", "g"),
            Ingredient("onion", "1", "medium"),
            Ingredient("carrot", "1", ""),
            Ingredient("celery", "1", "stalk"),
            Ingredient("tinned tomatoes", "400", "g"),
            Ingredient("tomato paste", "2", "tbsp"),
            Ingredient("garlic", "2", "cloves"),
            Ingredient("olive oil", "1", "tbsp"),
            Ingredient("oregano", "0.5", "tsp"),
        ),
        steps = listOf(
            "Dice onion, carrot and celery. Mince garlic. Heat oil, fry veg until soft. Add beef and brown.",
            "Stir in tomato paste, tinned tomatoes and oregano. Simmer 30–40 min. Season.",
            "Cook spaghetti in salted water until al dente. Drain and serve with the sauce.",
        ),
        servings = 4,
        tags = listOf("dinner", "pasta"),
    ),
    RecipeDoc(
        name = "Vegetable Curry",
        description = "Mild coconut vegetable curry with rice.",
        ingredients = listOf(
            Ingredient("potato", "2", "medium"),
            Ingredient("cauliflower", "0.5", "head"),
            Ingredient("chickpeas", "400", "g can"),
            Ingredient("coconut milk", "400", "ml"),
            Ingredient("curry paste", "2", "tbsp"),
            Ingredient("onion", "1", "medium"),
            Ingredient("vegetable oil", "1", "tbsp"),
            Ingredient("rice", "300", "g uncooked"),
        ),
        steps = listOf(
            "Dice potato and onion, break cauliflower into florets. Drain chickpeas.",
            "Fry onion in oil until soft. Add curry paste, stir 1 min. Add potato, cauliflower, chickpeas and coconut milk. Simmer 20–25 min until potato is tender.",
            "Cook rice. Serve curry over rice.",
        ),
        servings = 4,
        tags = listOf("dinner", "vegan", "curry"),
    ),
    RecipeDoc(
        name = "Shepherd's Pie",
        description = "Minced lamb (or beef) topped with mashed potato and baked.",
        ingredients = listOf(
            Ingredient("minced lamb or beef", "500", "g"),
            Ingredient("potatoes", "800", "g"),
            Ingredient("onion", "1", "medium"),
            Ingredient("carrot", "2", "medium"),
            Ingredient("frozen peas", "100", "g"),
            Ingredient("tomato paste", "1", "tbsp"),
            Ingredient("stock", "200", "ml"),
            Ingredient("butter", "30", "g"),
            Ingredient("milk", "2", "tbsp"),
        ),
        steps = listOf(
            "Boil potatoes until tender, drain and mash with butter and milk. Season.",
            "Fry minced meat until browned. Add diced onion and carrot, cook 5 min. Add tomato paste, stock and peas. Simmer 10 min. Season.",
            "Put meat in an ovenproof dish, spread mash on top. Bake at 200°C for 25–30 min until golden.",
        ),
        servings = 4,
        tags = listOf("dinner", "one-pot"),
    ),
)

fun seedTestRecipesIfEmpty() {
    if (RecipeRepository.count() > 0) return
    val familyId = FamilyRepository.findFirstFamilyId() ?: return
    var inserted = 0
    for (recipe in testRecipes) {
        try {
            RecipeRepository.insert(familyId, recipe)
            inserted++
        } catch (e: Exception) {
            System.err.println("Seed data: failed to insert '${recipe.name}': ${e.message}")
            e.printStackTrace()
        }
    }
    println("Seed data: inserted $inserted of ${testRecipes.size} test recipes.")
}
