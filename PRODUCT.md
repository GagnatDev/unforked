# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A family (typically two adults plus children) sharing one meal plan, **phone-first**. The
recurring scenes are: standing at the kitchen counter cooking tonight's dinner, and walking
a grocery aisle one-handed with a phone. Desktop is used occasionally, mostly for the
week's planning and for capturing recipes. Within the family, one person usually plans the
week and any member may do the shopping; the shopping trip is claimed ("I'm going
shopping") so the others can see it is underway.

## Product Purpose

Plan the week's dinners, cook them, and shop for them from one shared source of truth.
Success is a family that never asks "what's for dinner?" and never arrives home from the
shop missing an ingredient. **The job the product must make effortless above all others is
shopping the list.**

## Positioning

The shopping list is not exported from the plan — it *is* the plan, generated from the
week's assigned recipes, scaled to the number of people eating each day, grouped by store
category, live-shared across the family, and usable offline in a shop with no signal.
Claiming the trip and pushing changes to the other family members while shopping is the
mechanism a recipe app or a note-taking list cannot copy.

## Operating Context

- Weekly rhythm: assign dinners to Mon–Sun (weeks are ISO week ids, `2026-W36`), set how
  many people eat each day, shop before the week starts, cook one recipe per evening.
- Cooking scene: phone propped on a counter, wet or busy hands, screen-wake-lock on, a
  step checklist that survives leaving the app.
- Shopping scene: one hand, moving, possibly offline; items ticked as they go into the
  cart; categories map to how a Norwegian grocery store is walked.
- Installed as a PWA; offline-first with a local store and background sync, so every
  screen must be honest about pending sync and offline state.
- Bilingual: English and Norwegian Bokmål (`nb`) — layouts must survive longer Norwegian
  strings.

## Capabilities and Constraints

- **Today:** tonight's recipe, people count, ingredients scaled to the people planned,
  step checklist with reset, keep-screen-awake.
- **Weekly menu:** recipe per day, per-day people override on a weekly default, drag/tap
  to swap two days' dinners, autosave.
- **Shopping list:** generated per week from the plan, grouped into 10 store categories
  (produce, bakery, meat, fish, dairy, frozen, pantry, beverages, household, other),
  free-text extra items, per-item edit of name/quantity/unit, category re-assignment,
  check/uncheck with `checked/total` progress, hide-checked toggle, swipe to delete,
  claim-the-trip ("I'm going shopping" → banner naming who and when → "Done"),
  TXT/CSV export, deep-linkable week via `?week=`.
- **Recipes:** library with name search, photo, tags, servings, ingredients, numbered
  steps, source URL attribution, import-from-URL (best-effort, editable before saving),
  swipe to delete.
- **Family:** up to five members, invite links, default number of people.
- **Push notifications** for shopping-list changes while someone is shopping; on iOS only
  after the app is added to the Home Screen.
- **API keys** so trusted machine clients (e.g. `aivo`) can reach the same data.
- Stack constraint: React 18 + Vite + Tailwind v4 + shadcn/Base UI components, i18next,
  lucide icons, Geist Variable. Redesign works within this component stack.
- Accessibility: light and dark themes are both shipped and must both stay correct.

## Brand Commitments

Name: **unforked**. No logo, wordmark, or brand palette is fixed yet — the current
appearance is stock shadcn neutral and carries no identity decision. The user has pinned
one binding visual reference set: warm off-white ground, deep forest green, rounded card
sheets, pill buttons, and a bottom tab bar with a centre action button (four attached
mobile app screenshots, 2026-08-29).

## Evidence on Hand

- Working app with real family data; seedable sample recipes (`SEED_TEST_DATA`).
- Real content available for mockups: recipe names, ingredients, steps, store categories,
  the 10 category labels above, and both locales' copy (`frontend/src/locales/{en,nb}.json`).
- No customers, pricing, testimonials, or usage metrics exist. Do not invent any.

## Product Principles

1. **The list is the product.** Every design decision defers to one-handed, moving,
   possibly-offline list use.
2. **Shared state must be visible.** Who is shopping, what synced, what is still pending —
   never silent.
3. **Offline is a normal state, not an error.** Degrade to it without alarm.
4. **The week is the unit.** Today, the menu, and the list are three views of one week.
5. **Cooking hands are busy.** Large targets, no precision gestures required for anything
   destructive or common.

## Accessibility & Inclusion

Light and dark themes both shipped. Touch targets sized for one-handed, in-motion use.
Norwegian and English string lengths must both fit. No colour-only state encoding —
checked, claimed, offline, and pending-sync each need a non-colour cue.
