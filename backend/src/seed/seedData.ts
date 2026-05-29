import type { Db } from "../db/kysely.js";
import type { RecipeDoc } from "../domain/types.js";
import { logger } from "../logger.js";
import { FamilyRepository } from "../storage/familyRepository.js";
import { RecipeRepository } from "../storage/recipeRepository.js";

// Static dev/e2e seed data, ported from the Kotlin SeedData object. Inserted at
// boot when SEED_TEST_DATA=true and the recipes table is empty, so Playwright
// and local dev have data to work with.
export const TEST_RECIPES: RecipeDoc[] = [
{
        name: "Tomato Pasta",
        description: "Simple weeknight pasta with fresh tomatoes and basil.",
        ingredients: [
            { name: "spaghetti", quantity: "400", unit: "g" },
            { name: "cherry tomatoes", quantity: "300", unit: "g" },
            { name: "garlic", quantity: "2", unit: "cloves" },
            { name: "olive oil", quantity: "2", unit: "tbsp" },
            { name: "basil", quantity: "1", unit: "handful" },
            { name: "parmesan", quantity: "50", unit: "g" },
        ],
        steps: [
            "Cook pasta in salted boiling water until al dente. Reserve 1 cup pasta water.",
            "Halve tomatoes. Finely chop garlic and basil.",
            "Heat oil in a large pan, add garlic until fragrant. Add tomatoes, season, cook 2–3 min.",
            "Toss in drained pasta, a splash of pasta water, and basil. Serve with parmesan.",
        ],
        servings: 4,
        tags: ["pasta", "vegetarian", "quick"],
    },
    {
        name: "Lentil Soup",
        description: "Hearty red lentil soup with vegetables and cumin.",
        ingredients: [
            { name: "red lentils", quantity: "200", unit: "g" },
            { name: "onion", quantity: "1", unit: "medium" },
            { name: "carrot", quantity: "2", unit: "medium" },
            { name: "celery", quantity: "2", unit: "stalks" },
            { name: "cumin", quantity: "1", unit: "tsp" },
            { name: "vegetable stock", quantity: "1", unit: "L" },
            { name: "lemon juice", quantity: "1", unit: "tbsp" },
        ],
        steps: [
            "Rinse lentils. Dice onion, carrot, and celery.",
            "Sauté onion, carrot, celery in a little oil until soft. Add cumin and stir 1 min.",
            "Add lentils and stock. Bring to a boil, simmer 20–25 min until lentils are tender.",
            "Blend half if you like it creamy. Stir in lemon juice and season to taste.",
        ],
        servings: 4,
        tags: ["soup", "vegetarian", "vegan"],
    },
    {
        name: "Omelette with Herbs",
        description: "Fluffy omelette with mixed herbs and optional cheese.",
        ingredients: [
            { name: "eggs", quantity: "3", unit: "" },
            { name: "milk", quantity: "1", unit: "tbsp" },
            { name: "mixed herbs", quantity: "1", unit: "tbsp" },
            { name: "butter", quantity: "15", unit: "g" },
            { name: "grated cheese", quantity: "30", unit: "g" },
        ],
        steps: [
            "Beat eggs with milk, herbs, salt and pepper.",
            "Melt butter in a non-stick pan over medium heat. Pour in egg mix.",
            "When edges set, add cheese on one half. Fold and slide onto a plate.",
        ],
        servings: 1,
        tags: ["breakfast", "vegetarian", "quick"],
    },
    {
        name: "Chickpea Salad",
        description: "Fresh chickpea and vegetable salad with a lemon dressing.",
        ingredients: [
            { name: "canned chickpeas", quantity: "400", unit: "g" },
            { name: "cucumber", quantity: "1", unit: "small" },
            { name: "tomato", quantity: "2", unit: "medium" },
            { name: "red onion", quantity: "0.5", unit: "" },
            { name: "parsley", quantity: "0.5", unit: "bunch" },
            { name: "olive oil", quantity: "2", unit: "tbsp" },
            { name: "lemon juice", quantity: "1", unit: "tbsp" },
        ],
        steps: [
            "Drain and rinse chickpeas. Dice cucumber, tomato, and onion. Chop parsley.",
            "Mix olive oil, lemon juice, salt and pepper for the dressing.",
            "Combine chickpeas and vegetables in a bowl, toss with dressing and parsley.",
        ],
        servings: 2,
        tags: ["salad", "vegan", "quick"],
    },
    {
        name: "Rice and Black Beans",
        description: "Simple rice and black beans with onion and spices.",
        ingredients: [
            { name: "long-grain rice", quantity: "200", unit: "g" },
            { name: "black beans", quantity: "400", unit: "g can" },
            { name: "onion", quantity: "1", unit: "medium" },
            { name: "cumin", quantity: "0.5", unit: "tsp" },
            { name: "paprika", quantity: "0.5", unit: "tsp" },
            { name: "stock or water", quantity: "400", unit: "ml" },
        ],
        steps: [
            "Rinse rice. Drain beans. Dice onion.",
            "Sauté onion until soft. Add cumin and paprika, stir 1 min.",
            "Add rice, stock, and beans. Bring to a boil, cover, simmer 18–20 min. Fluff and serve.",
        ],
        servings: 3,
        tags: ["vegan", "one-pot"],
    },
    {
        name: "Grilled Cheese",
        description: "Crispy bread with melted cheese.",
        ingredients: [
            { name: "bread slices", quantity: "2", unit: "" },
            { name: "cheddar or gruyère", quantity: "50", unit: "g" },
            { name: "butter", quantity: "15", unit: "g" },
        ],
        steps: [
            "Butter one side of each bread slice. Place cheese between unbuttered sides.",
            "Fry in a pan over medium heat until golden on both sides and cheese melts.",
        ],
        servings: 1,
        tags: ["quick", "vegetarian"],
    },
    {
        name: "Avocado Toast",
        description: "Mashed avocado on toasted bread with lemon and salt.",
        ingredients: [
            { name: "bread", quantity: "2", unit: "slices" },
            { name: "ripe avocado", quantity: "1", unit: "" },
            { name: "lemon juice", quantity: "0.5", unit: "" },
            { name: "salt and pepper", quantity: "", unit: "" },
        ],
        steps: [
            "Toast bread. Mash avocado with lemon juice, salt and pepper.",
            "Spread on toast. Add optional chilli flakes or seeds.",
        ],
        servings: 1,
        tags: ["breakfast", "vegan", "quick"],
    },
    {
        name: "Oatmeal with Banana",
        description: "Creamy oats with sliced banana.",
        ingredients: [
            { name: "rolled oats", quantity: "50", unit: "g" },
            { name: "water or milk", quantity: "200", unit: "ml" },
            { name: "banana", quantity: "1", unit: "" },
            { name: "honey or maple syrup", quantity: "1", unit: "tbsp" },
        ],
        steps: [
            "Cook oats in water or milk according to package (about 5 min).",
            "Slice banana on top, drizzle with honey or syrup.",
        ],
        servings: 1,
        tags: ["breakfast", "vegetarian", "quick"],
    },
    {
        name: "Cucumber Salad",
        description: "Sliced cucumber with dill and vinegar.",
        ingredients: [
            { name: "cucumber", quantity: "2", unit: "medium" },
            { name: "dill", quantity: "2", unit: "tbsp" },
            { name: "white vinegar", quantity: "1", unit: "tbsp" },
            { name: "sugar", quantity: "0.5", unit: "tsp" },
            { name: "salt", quantity: "pinch", unit: "" },
        ],
        steps: [
            "Thinly slice cucumber. Chop dill.",
            "Mix vinegar, sugar, salt. Toss with cucumber and dill. Chill briefly.",
        ],
        servings: 2,
        tags: ["salad", "vegan", "quick"],
    },
    {
        name: "Garlic Bread",
        description: "Toasted bread with garlic butter.",
        ingredients: [
            { name: "baguette or bread", quantity: "0.5", unit: "" },
            { name: "butter", quantity: "40", unit: "g" },
            { name: "garlic", quantity: "2", unit: "cloves" },
            { name: "parsley", quantity: "1", unit: "tbsp" },
        ],
        steps: [
            "Mix soft butter with minced garlic and chopped parsley.",
            "Slice bread, spread butter on cut sides. Bake at 200°C until golden (about 8 min).",
        ],
        servings: 2,
        tags: ["vegetarian", "quick"],
    },
    {
        name: "Bean Tacos",
        description: "Soft tacos with refried beans and fresh toppings.",
        ingredients: [
            { name: "soft tortillas", quantity: "6", unit: "" },
            { name: "refried beans", quantity: "400", unit: "g can" },
            { name: "lettuce", quantity: "2", unit: "handfuls" },
            { name: "tomato", quantity: "1", unit: "diced" },
            { name: "lime", quantity: "1", unit: "" },
            { name: "hot sauce", quantity: "", unit: "" },
        ],
        steps: [
            "Warm tortillas. Heat beans in a small pan.",
            "Fill tortillas with beans, lettuce, tomato. Squeeze lime and add hot sauce.",
        ],
        servings: 2,
        tags: ["vegan", "quick"],
    },
    {
        name: "Tomato and Mozzarella Salad",
        description: "Caprese-style salad with tomato, mozzarella and basil.",
        ingredients: [
            { name: "tomatoes", quantity: "3", unit: "medium" },
            { name: "mozzarella", quantity: "150", unit: "g" },
            { name: "basil", quantity: "1", unit: "handful" },
            { name: "olive oil", quantity: "2", unit: "tbsp" },
            { name: "balsamic", quantity: "1", unit: "tsp" },
        ],
        steps: [
            "Slice tomatoes and mozzarella. Arrange on a plate with basil leaves.",
            "Drizzle with olive oil and balsamic. Season with salt and pepper.",
        ],
        servings: 2,
        tags: ["salad", "vegetarian", "quick"],
    },
    {
        name: "Scrambled Eggs",
        description: "Creamy scrambled eggs on toast.",
        ingredients: [
            { name: "eggs", quantity: "3", unit: "" },
            { name: "butter", quantity: "15", unit: "g" },
            { name: "bread", quantity: "2", unit: "slices" },
            { name: "salt and pepper", quantity: "", unit: "" },
        ],
        steps: [
            "Beat eggs with salt and pepper. Melt butter in a non-stick pan over low heat.",
            "Add eggs and stir gently until just set. Serve on toast.",
        ],
        servings: 1,
        tags: ["breakfast", "vegetarian", "quick"],
    },
    {
        name: "Peanut Butter Banana Sandwich",
        description: "Peanut butter and banana between bread.",
        ingredients: [
            { name: "bread", quantity: "2", unit: "slices" },
            { name: "peanut butter", quantity: "2", unit: "tbsp" },
            { name: "banana", quantity: "1", unit: "" },
        ],
        steps: [
            "Toast bread if desired. Spread peanut butter on both slices.",
            "Slice banana and layer on one slice. Close sandwich and cut in half.",
        ],
        servings: 1,
        tags: ["breakfast", "vegetarian", "quick"],
    },
    {
        name: "Tuna and Sweetcorn Wrap",
        description: "Tuna, sweetcorn and mayo in a soft wrap.",
        ingredients: [
            { name: "tuna in water", quantity: "1", unit: "small can" },
            { name: "sweetcorn", quantity: "3", unit: "tbsp" },
            { name: "mayonnaise", quantity: "1", unit: "tbsp" },
            { name: "large wrap", quantity: "1", unit: "" },
            { name: "lettuce", quantity: "2", unit: "leaves" },
        ],
        steps: [
            "Drain tuna. Mix with sweetcorn and mayonnaise.",
            "Lay wrap flat, add lettuce and tuna mix. Roll up and serve.",
        ],
        servings: 1,
        tags: ["quick"],
    },
    {
        name: "Mug Omelette",
        description: "Single-serving omelette made in a mug in the microwave.",
        ingredients: [
            { name: "eggs", quantity: "2", unit: "" },
            { name: "milk", quantity: "1", unit: "tbsp" },
            { name: "grated cheese", quantity: "2", unit: "tbsp" },
            { name: "salt and pepper", quantity: "", unit: "" },
        ],
        steps: [
            "Beat eggs, milk, salt and pepper in a large microwave-safe mug.",
            "Microwave 1 min, stir, add cheese, microwave 30–60 sec until set.",
        ],
        servings: 1,
        tags: ["breakfast", "vegetarian", "quick"],
    },
    {
        name: "Chicken Stir-Fry",
        description: "Quick chicken and vegetable stir-fry with soy and ginger.",
        ingredients: [
            { name: "chicken breast", quantity: "400", unit: "g" },
            { name: "broccoli", quantity: "200", unit: "g" },
            { name: "bell pepper", quantity: "1", unit: "" },
            { name: "soy sauce", quantity: "2", unit: "tbsp" },
            { name: "ginger", quantity: "1", unit: "thumb" },
            { name: "garlic", quantity: "2", unit: "cloves" },
            { name: "vegetable oil", quantity: "2", unit: "tbsp" },
            { name: "rice", quantity: "300", unit: "g cooked" },
        ],
        steps: [
            "Slice chicken into strips. Cut broccoli into florets, pepper into strips. Grate ginger, mince garlic.",
            "Heat oil in a wok or large pan. Stir-fry chicken until golden, set aside. Stir-fry vegetables 3–4 min.",
            "Return chicken, add soy sauce and garlic. Toss 1 min. Serve over rice.",
        ],
        servings: 4,
        tags: ["dinner", "stir-fry"],
    },
    {
        name: "Baked Salmon with Lemon and Dill",
        description: "Oven-baked salmon fillets with lemon, dill and olive oil.",
        ingredients: [
            { name: "salmon fillets", quantity: "4", unit: "approx 150g each" },
            { name: "lemon", quantity: "1", unit: "" },
            { name: "fresh dill", quantity: "2", unit: "tbsp" },
            { name: "olive oil", quantity: "2", unit: "tbsp" },
            { name: "garlic", quantity: "1", unit: "clove" },
            { name: "salt and pepper", quantity: "", unit: "" },
        ],
        steps: [
            "Place salmon on a lined baking tray. Drizzle with oil, season, top with sliced lemon and dill.",
            "Bake at 200°C for 12–15 min until opaque and flaky. Serve with extra lemon.",
        ],
        servings: 4,
        tags: ["dinner", "fish"],
    },
    {
        name: "Spaghetti Bolognese",
        description: "Classic beef and tomato sauce with spaghetti.",
        ingredients: [
            { name: "minced beef", quantity: "500", unit: "g" },
            { name: "spaghetti", quantity: "400", unit: "g" },
            { name: "onion", quantity: "1", unit: "medium" },
            { name: "carrot", quantity: "1", unit: "" },
            { name: "celery", quantity: "1", unit: "stalk" },
            { name: "tinned tomatoes", quantity: "400", unit: "g" },
            { name: "tomato paste", quantity: "2", unit: "tbsp" },
            { name: "garlic", quantity: "2", unit: "cloves" },
            { name: "olive oil", quantity: "1", unit: "tbsp" },
            { name: "oregano", quantity: "0.5", unit: "tsp" },
        ],
        steps: [
            "Dice onion, carrot and celery. Mince garlic. Heat oil, fry veg until soft. Add beef and brown.",
            "Stir in tomato paste, tinned tomatoes and oregano. Simmer 30–40 min. Season.",
            "Cook spaghetti in salted water until al dente. Drain and serve with the sauce.",
        ],
        servings: 4,
        tags: ["dinner", "pasta"],
    },
    {
        name: "Vegetable Curry",
        description: "Mild coconut vegetable curry with rice.",
        ingredients: [
            { name: "potato", quantity: "2", unit: "medium" },
            { name: "cauliflower", quantity: "0.5", unit: "head" },
            { name: "chickpeas", quantity: "400", unit: "g can" },
            { name: "coconut milk", quantity: "400", unit: "ml" },
            { name: "curry paste", quantity: "2", unit: "tbsp" },
            { name: "onion", quantity: "1", unit: "medium" },
            { name: "vegetable oil", quantity: "1", unit: "tbsp" },
            { name: "rice", quantity: "300", unit: "g uncooked" },
        ],
        steps: [
            "Dice potato and onion, break cauliflower into florets. Drain chickpeas.",
            "Fry onion in oil until soft. Add curry paste, stir 1 min. Add potato, cauliflower, chickpeas and coconut milk. Simmer 20–25 min until potato is tender.",
            "Cook rice. Serve curry over rice.",
        ],
        servings: 4,
        tags: ["dinner", "vegan", "curry"],
    },
    {
        name: "Shepherd's Pie",
        description: "Minced lamb (or beef) topped with mashed potato and baked.",
        ingredients: [
            { name: "minced lamb or beef", quantity: "500", unit: "g" },
            { name: "potatoes", quantity: "800", unit: "g" },
            { name: "onion", quantity: "1", unit: "medium" },
            { name: "carrot", quantity: "2", unit: "medium" },
            { name: "frozen peas", quantity: "100", unit: "g" },
            { name: "tomato paste", quantity: "1", unit: "tbsp" },
            { name: "stock", quantity: "200", unit: "ml" },
            { name: "butter", quantity: "30", unit: "g" },
            { name: "milk", quantity: "2", unit: "tbsp" },
        ],
        steps: [
            "Boil potatoes until tender, drain and mash with butter and milk. Season.",
            "Fry minced meat until browned. Add diced onion and carrot, cook 5 min. Add tomato paste, stock and peas. Simmer 10 min. Season.",
            "Put meat in an ovenproof dish, spread mash on top. Bake at 200°C for 25–30 min until golden.",
        ],
        servings: 4,
        tags: ["dinner", "one-pot"],
    },
];

/** Insert the test recipes into the first family if the recipes table is empty. */
export async function seedTestRecipesIfEmpty(db: Db): Promise<void> {
  const recipes = new RecipeRepository(db);
  if ((await recipes.count()) > 0) return;
  const familyId = await new FamilyRepository(db).findFirstFamilyId();
  if (!familyId) return;
  let inserted = 0;
  for (const recipe of TEST_RECIPES) {
    try {
      await recipes.insert(familyId, recipe);
      inserted += 1;
    } catch (err) {
      logger.error(err, `seed: failed to insert "${recipe.name}"`);
    }
  }
  logger.info(`seed: inserted ${inserted} of ${TEST_RECIPES.length} test recipes`);
}
