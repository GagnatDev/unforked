# Design

The visual system of unforked. Product truth lives in [PRODUCT.md](PRODUCT.md);
this file records how the interface looks and behaves, and why.

## Direction: Warm kitchen

Chosen 2026-08-29 from four directions (the measure, shelf edge, warm kitchen,
coupon book). The thesis: **a shared kitchen record, not a card feed.** It
refuses the stock neutral admin shell the app shipped with, and the top nav bar
that put navigation out of thumb reach on the phone that actually uses it.

The scene decides the light: a phone at a kitchen counter and in a grocery
aisle, mostly in daylight or under kitchen lights. Light is the default; dark is
the same world with the lights down, and both ship.

## Colour

Strategy: **restrained** — a warm neutral ground with one saturated colour.

Green is load-bearing, not decorative: **it appears only where something can be
done or has been done.** A green surface is an action or the state of a shared
action; a green tick is a completed one. Nothing else is green. When everything
on a screen is inert, no green appears on it.

| Role | Light | Dark |
| --- | --- | --- |
| Ground (`--background`) | warm off-white `#F1F0EC` | `#131714` |
| Sheet (`--card`) | white | `#1B211D` |
| Action (`--primary`) | forest green `#2C5F45` | mint `#9FD9B4` |
| Tab bar (`--nav`) | deep green `#17352A` | `#232A25` |
| Tab bar accent (`--nav-accent`) | mint `#9FD9B4` | mint `#9FD9B4` |

Forest green goes muddy on a dark ground, so dark swaps the action colour to
mint and inverts its foreground. Body text clears 4.5:1 and large text 3:1 on
every surface in both themes; secondary text is tinted from the ground's hue
(`--muted-foreground`), never grey.

Tokens live in `frontend/src/index.css` as `:root` / `.dark` custom properties
and are exposed to Tailwind through `@theme inline`. `--nav*` is the one family
this app adds to the shadcn set: the tab bar is its own surface in both themes,
because it must read as furniture the page scrolls under rather than as another
card. The PWA `theme-color` metas in `frontend/index.html` track the ground.

## Type

**Figtree Variable**, self-hosted via `@fontsource-variable/figtree` so it works
offline like the rest of the app. One family; hierarchy comes from weight and
size. Quantities and counters set `tabular-nums` so digits line up down a
column — the shopping list and the ingredient list are read as columns of
numbers, not sentences.

## Shape and depth

`--radius: 1rem`. Sheets are `rounded-2xl` (22px), rows inside them `rounded-xl`,
pills and primary actions fully round. Cards carry no border in light — the
white sheet against the warm ground is the edge. The tab bar is the only
element with a shadow, because it is the only element that floats.

## Navigation

Four destinations — Today, Weekly menu, Shopping list, Recipes — in a floating
bottom tab bar (`components/BottomNav.tsx`), inside the content's max width so
it does not stretch across a desktop window. Every tab is labelled; the active
one takes a tinted pill, a mint icon and a heavier stroke.

**No centre action button.** The bar is navigation and nothing else. The add
actions are unequal and screen-specific, so each lives where it belongs: *Add
item* at the foot of the shopping list, where you can see where the new row will
land, and *New recipe* on the recipe library. A centre button would have to
change meaning under the thumb, and neither action is frequent enough to earn
the most reachable pixel on the screen — the frequent gesture is ticking things
off, which is not an add.

`components/TopBar.tsx` keeps only what must be true everywhere: the wordmark,
one inspectable sync-status control, and the menu (profile, log out).

Settings sits off the tab bar: Profile is reached from that menu, and Family
and API keys from rows on Profile. Installed as a PWA there is no browser back
button, so each of those pages carries its own way back (`components/BackLink.tsx`)
above the heading — quiet, muted, never green, because returning is furniture
rather than an action.

## State

No state is encoded in colour alone — a requirement from PRODUCT.md, and simply
what survives a bright aisle:

- **Checked / done:** tinted row + strike-through + a filled tick. Rows tint and
  stay in place rather than fading out; a dimmed row is hard to read in daylight,
  and checked items must remain findable mid-shop.
- **Someone is shopping:** a named line inside the green status card, alongside
  the progress it belongs to — not a separate banner.
- **Sync:** one quiet dot with a text state in the top bar (synced, syncing,
  offline, or paused). Its popover shows pending changes, the reason sync paused,
  and a manual retry. Local editing remains available.

## Signature moment

The shopping list's **status card**: one green sheet carrying how far the list
has got (`3/10` plus a progress bar) and the trip itself — *Ready to shop* or
*I'm going shopping*, or who is out (or finished the list) and since when, with
*Shopping done*. Progress and the shared trip are one fact, so they are one
object. Finished trips drop below the list as *Bought this week*: a quiet
record, ticks only, never green.

## Forms

Fields are grouped into sheets by what they are about, not by input type: the
recipe form is *details*, *ingredients*, *steps* — three sheets, one job each;
settings is *preferences*, *notifications*, *manage*, and family is *defaults*,
*members*, *invite*, *join*.
Field labels are small and quiet; the field itself carries the weight, at 44px
minimum so it can be hit with one thumb. Long forms keep their save action
sticky, floating above the tab bar rather than under it, with no bar behind
it — the button alone floats, so nothing is hidden by a slab of chrome.

## Scope

The direction covers every screen the app ships: the theme, the navigation, the
shopping list, Today, the weekly menu, the recipe form, and the settings screens
(profile, family, API keys, and the invitation page invite links land on).

Settings adds two shapes the rest of the app did not need. **Rows that lead
somewhere** — a muted icon, the destination, one line of why, a chevron —
grouped in a single sheet rather than given a card each, because they are doors
out of a page, not content. And **the result panel**: a tinted (`bg-accent`)
well inside the sheet whose form produced it, for the two things that exist for
one moment and have to leave with you — a fresh invite link, and the plaintext
of a new API key. Tint marks what has just happened, the same way a ticked
shopping row does.
