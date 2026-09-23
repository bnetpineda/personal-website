# Design system

UI is built from **shadcn/ui components (Radix) in `components/ui`**, themed with the site's
"Still Building" neo-brutalist palette. App code composes those components and styles itself
only with **theme tokens** and **layout utilities**. These rules are enforced by
[`@shadcn/lint`](https://github.com/shadcn-ui/lint) via `design-system.lint.json` (run `bun run lint`).

Scope: everything under `app/admin/**` (and any new UI). The public one-pager
(`components/sections/*`, `.site` classes in `app/globals.css`) predates the system; migrate a
piece to these rules when you touch it.

## 1. Tokens (app/globals.css)

Semantic shadcn tokens map onto the palette (`--paper`, `--ink`, `--accent`, …), so light/dark
switch automatically with the `.dark` class. Never use raw colors (`bg-red-500`, `#fff`, `bg-[#…]`).

| Token | Use | Light / Dark |
| --- | --- | --- |
| `background` / `foreground` | page surface / text | paper / ink |
| `card`, `popover` (+ `-foreground`) | raised surfaces, menus | paper-2 |
| `primary` / `primary-foreground` | main action, **active/selected state** | lime / ink (both themes) |
| `secondary` | ink-filled button | ink / paper |
| `muted` / `muted-foreground` | subtle fills, secondary text | ink 7–10% / ink-soft |
| `accent` / `accent-foreground` | hover + highlighted items | lime / ink |
| `destructive` | errors, losses, delete | `--danger` |
| `success` | gains, positive P/L | green |
| `warning` / `warning-foreground` | stale data, budgets ≥ 85% | amber / ink |
| `border`, `input`, `ring` | 2px ink outlines, focus | ink |
| `chart-1 … chart-9` | data series, asset classes, category palette | fixed hues |

- **Active states are always `bg-primary text-primary-foreground`** (lime + ink) — readable in both
  themes. Never pair `bg-foreground`/`bg-ink` with inherited text color.
- **Radius**: `rounded-sm` 6px · `rounded-md` 10px (controls) · `rounded-lg` 14px (cards) ·
  `rounded-full` (badges, bars).
- **Shadows are hard offsets**: `shadow-xs` 2px · `shadow-sm` 3px (buttons) · `shadow-md` 4px
  (cards) · `shadow-lg` 6px · `shadow-xl` 8px — all `var(--border)`. No soft/blurred shadows.
- **Borders**: components use `border-2 border-border`.
- **Type**: `font-display` (Archivo Black — titles, buttons, big numbers; uppercase) ·
  `font-sans` (Work Sans — body) · `font-mono` (Space Mono — labels, eyebrows, numbers in tables;
  uppercase + `tracking-wider` for labels). Use `tabular-nums` for amounts.
- Custom utilities live in `globals.css` as `@utility`: `pb-safe` / `mb-safe` (fixed bottom bars and
  floating buttons clear the iOS home indicator) and `pt-safe` (sticky headers clear the notch). They
  only take effect because `app/admin/layout.tsx` sets `viewportFit: "cover"` for the installed app.
  Don't add plain CSS classes for new UI.

## 2. Components

Use the component that fits; don't rebuild it from `div`s.

| Need | Use |
| --- | --- |
| Action | `Button` — `default` (lime), `outline` (paper), `secondary` (ink), `ghost`, `destructive`, `link`; sizes `xs sm default lg icon icon-sm …` |
| Link that looks like a button | `<Button asChild><Link …/></Button>` |
| Surface / KPI tile | `Card` (+ `variant="primary"` for the lime highlight), `CardHeader/Title/Description/Action/Content` |
| Form field | `Field` + `FieldLabel` + `Input`/`Select`/`Textarea` + `FieldError`/`FieldDescription`, grouped in `FieldGroup` |
| Choice from a list | `Select` (gives a hidden native `<select name>` for FormData) |
| Date | `DatePicker` — `Popover` + `Calendar`; submits `YYYY-MM-DD` under `name` (hidden input) |
| Segmented choice | `ToggleGroup` (single) · content panels → `Tabs` · pick one of many (categories) → `ToggleGroup spacing={2} className="flex-wrap"` + hidden input |
| On/off | `Toggle` |
| Status label | `Badge` — `default outline secondary destructive success warning` |
| Progress / budget / utilization | `Progress` — `variant` `default success warning destructive`, or `indicatorColor` for data colors |
| Data color dot / color picker | `Swatch` / `SwatchPicker` (components/ui/swatch.tsx) |
| Lists of records | `ItemGroup` + `Item` (`ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`) |
| Tappable record (opens its edit sheet) | `EditableRow` (list) / `EditableTableRow` (table) / `EditableCardHeader` (card) in `app/admin/_components/row-actions.tsx` — `Item variant="interactive"` + a real `<button>` whose `after:` overlay covers the row |
| Tables | `Table` inside `Card` (`className="gap-0 overflow-hidden py-0"`) |
| Row actions | `DropdownMenu` → edit in `Sheet` (+ extra `sheets`/`actions`), destructive confirm in `AlertDialog` or delete-with-Undo (see `RowActions`) |
| Feedback after an action | Toast — `notify(state, undo?)` from `app/admin/_components/form.tsx` (sonner `Toaster`, mounted once in `Shell`) |
| Command palette | `CommandDialog` (cmdk) — `CommandMenu`, opened with ⌘K / Ctrl+K or `/` |
| Keyboard hint | `Kbd` |
| Checkbox | `Checkbox` inside `Field orientation="horizontal"` |
| Create / edit forms | `Sheet` (right side) — `FormSheet` in admin |
| Empty / zero state | `Empty` (`EmptyHeader`, `EmptyTitle`, `EmptyDescription`) |
| Notices | `Alert` — `default warning destructive` |
| Loading | `Skeleton`, `Spinner` |
| Hints on icon buttons | `Tooltip` (admin is wrapped in `TooltipProvider`) |
| Charts (trend, allocation, breakdown) | `ChartContainer` + Recharts; series colors from `ChartConfig` (`var(--chart-N)`), per-row data colors via `<Cell fill>` |

Admin-specific compositions live in `app/admin/_components` (`PageHeader`, `StatCards`, `Panel`,
`Breakdown`, `Money`, `MonthPicker`, `FormField`, `FormSheet`, `RowActions`, the recurring
`OccurrenceList` / `DuePanel` / `DueActions`, `EditableRow`, `QuickAdd`, `BudgetsForm`, and the charts `NetWorthChart`, `CashFlowChart`,
`AllocationChart`, `BreakdownChart`) — reuse them before writing new ones.

## 3. Rules (enforced — `design-system.lint.json`)

1. **Don't restyle components with `className`** (`shadcn/no-restyle`). Only **layout** classes
   (margin, width/height, flex/grid placement, position, display) are allowed on a component.
   Need a different look? Use a `variant`/`size`, or **add a variant to the component in
   `components/ui` with `cva`**. Contracts (the only exceptions):
   - `Card`, `CardHeader`, `CardContent`, `CardFooter`, `FieldGroup`, `SheetHeader`, `SheetFooter`: layout + spacing
   - `CardTitle`, `CardDescription`, `TableHead`, `TableCell`: layout + typography
2. **Theme tokens only** (`shadcn/no-raw-colors`) — no palette colors, hex, or arbitrary colors.
3. **No arbitrary values** (`shadcn/no-arbitrary-values`) — use the scale (`p-3`, not `p-[13px]`).
4. **No inline styles in app code** (`shadcn/no-inline-styles`). Data-driven colors/widths go
   through `Swatch`, `SwatchPicker`, `Progress indicatorColor`, or chart fills (`ChartConfig`,
   Recharts `fill`/`<Cell fill>`).
5. **Only classes Tailwind can generate** (`shadcn/no-unknown-classes`) — no ad-hoc CSS classes.
6. **Static class strings on components** (`shadcn/require-static-classes`) — conditional styling
   goes through props/variants (`variant={active ? "default" : "ghost"}`), or `cn()` with literal
   strings on plain elements.

`components/ui/**` is exempt: components define their own look. When you add one:

```bash
bunx --bun shadcn@latest add <component>   # official registry, Radix; imports `cn` from "cn"
```

then give it the house style: `border-2 border-border`, token colors, `shadow-sm`/`shadow-md`,
`font-display` + `uppercase` for titles/buttons, `font-mono` + `uppercase tracking-wider` for
labels, `font-normal` on portalled content (sheets, menus, dialogs). Don't overwrite existing
components without re-applying these (`--overwrite` replaces the house style).

## 4. Patterns

- **Money**: always `<Money value currency tone? signed?>` — formats with `Intl` and blurs in
  privacy mode (`group-data-[private=true]/shell:blur-sm`).
- **Forms**: Server Action + `useFormAction` (admin) → errors from the returned `FormState`,
  `aria-invalid` on the control, message in `FieldError`. Success closes the sheet, resets, and
  toasts the message; pass `undo` to add an "Undo" button (e.g. a new entry, a debt payment).
- **Destructive actions**: confirm in `AlertDialog`; never `window.confirm`. Exception: cheap,
  fully reversible deletes (single cash-flow entries) run straight away with an "Undo" toast
  (`RowActions onRestore`).
- **Toasts never show amounts** that weren't typed by the user — they aren't blurred by privacy mode.
- **Adding entries**: one quick-add sheet for the whole dashboard (`QuickAdd`, opened via
  `useAdminUi().setAdding(kind)`, the E / I keys, the command menu or `/admin?add=expense`) —
  don't build per-page add forms for cash flows.
- **Accessibility**: every control has a label (`FieldLabel htmlFor` or `aria-label` on icon
  buttons); status text uses `role="status"`; don't remove focus rings.
- **Dark mode**: never hard-code light/dark values in app code — tokens flip automatically.
