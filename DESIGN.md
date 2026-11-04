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
- Custom utilities live in `globals.css` as `@utility`: `pb-safe` / `mb-safe` (bottom edges and
  floating buttons clear the iOS home indicator; admin `<main>` uses `mb-safe`, there is no footer) and `pt-safe`
  (sticky headers clear the notch). They only take effect because `app/admin/layout.tsx` sets
  `viewportFit: "cover"` for the installed app. Don't add plain CSS classes for new UI.

## 2. Components

Use the component that fits; don't rebuild it from `div`s.

| Need | Use |
| --- | --- |
| Action | `Button` — `default` (lime), `outline` (paper), `secondary` (ink), `ghost`, `destructive`, `link`, `subtle` (body type, no caps: inline pickers in rows); sizes `xs sm default lg icon icon-sm …` |
| Link that looks like a button | `<Button asChild><Link …/></Button>` |
| Surface / KPI tile | `Card` (+ `variant="primary"` for the lime highlight, `variant="quiet"` + `size="sm"` for dense dashboard panels), `CardHeader/Title/Description/Action/Content` |
| Form field | `Field` + `FieldLabel` + `Input`/`Select`/`Textarea` + `FieldError`/`FieldDescription`, grouped in `FieldGroup` |
| Choice from a list | `Select` (gives a hidden native `<select name>` for FormData) |
| Date | `DatePicker` — `Popover` + `Calendar`; submits `YYYY-MM-DD` under `name` (hidden input) |
| Segmented choice | `ToggleGroup` (single) · content panels → `Tabs` · pick one of many (categories) → `ToggleGroup spacing={2} className="flex-wrap"` + hidden input |
| On/off | `Toggle` |
| Status label | `Badge` — `default outline secondary destructive success warning` |
| Progress / budget / utilization | `Progress` — `variant` `default success warning destructive`, or `indicatorColor` for data colors |
| Data color dot / color picker | `Swatch` / `SwatchPicker` (components/ui/swatch.tsx) |
| Lists of records | `ItemGroup` + `Item` (`ItemMedia`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions`); in dense panels `Item size="xs"` and, for feeds, `ItemDescription clamp={1} title={fullText}` |
| Tappable record (opens its edit sheet) | `EditableRow` (list) / `EditableTableRow` (table) / `EditableCardHeader` (card) in `app/admin/_components/row-actions.tsx` — `Item variant="interactive"` + a real `<button>` whose `after:` overlay covers the row |
| Tables | `Table` inside `Card` (`className="gap-0 overflow-hidden py-0"`) |
| Row actions | `DropdownMenu` → edit in `Sheet` (+ extra `sheets`/`actions`), destructive confirm in `AlertDialog` or delete-with-Undo (see `RowActions`) |
| Feedback after an action | Toast — `notify(state, undo?)` from `app/admin/_components/form.tsx` (sonner `Toaster`, mounted once in `Shell`) |
| Keyboard hint | `Kbd` |
| Checkbox | `Checkbox` inside `Field orientation="horizontal"` |
| Create / edit forms | `Sheet` (right side) — `FormSheet` in admin |
| Empty / zero state | `Empty` (`EmptyHeader`, `EmptyTitle`, `EmptyDescription`); `size="sm"` (or `EmptyState size="sm"`) inside dense panels |
| Notices | `Alert` — `default warning destructive` |
| Loading | `Skeleton`, `Spinner` |
| Scrolling region (panel bodies) | `ScrollArea` — the house scrollbar shows on hover/scroll; `Panel fill` uses it (never the browser's own scrollbar) |
| Hints on icon buttons | `Tooltip` (admin is wrapped in `TooltipProvider`) |
| Dense controls on a touchscreen | `Button touch` opts into 44px coarse-pointer targets without changing desktop density |
| Search / jump / run anything | `CommandDialog` (cmdk) — the admin's ⌘K / Ctrl+K `CommandMenu`, mounted once in `Shell` |
| Explanation + fix next to a marker | `Popover` (e.g. `CoverageBadge`) |
| Charts (trend, allocation, sparkline, tile mini bars) | `ChartContainer` + Recharts; series colors from `ChartConfig` (`var(--chart-N)`), per-row data colors via `<Cell fill>` |

Admin-specific compositions live in `app/admin/_components` (`PageHeader`, `StatCards`, `Panel`
(`fill` = the dashboard's dense, self-scrolling panel), `Money`, `MonthPicker`, `FormField`,
`FormSheet`, `RowActions`, the recurring `OccurrenceList` / `DueList` / `DuePanel` / `DueActions`,
`EditableRow` (+ `extra` controls), `AddEntry`, `BudgetsForm`, `TeachList`, `PortfolioAccounts`,
the dashboard's `KpiStrip` / `CoverageBadge` / `NeedsYou` / `AccountsPanel` (dashboard.tsx),
`ActivityFeed`, `CategoryBreakdown`, `CategoryPicker`, `MonthNav`, `CommandMenu` (⌘K), the
`AdminHeader` frame, `SyncNowButton`, and the charts `PortfolioChart`,
`CashFlowChart` (+ `CashFlowLegend`), `AllocationChart`, `Sparkline`, `MiniBars`) — reuse them before writing
new ones.

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
  privacy mode (`group-data-[private=true]/shell:blur-sm`). Portals do not inherit the shell's CSS
  ancestor: read-only amounts in a sheet need a live privacy boundary inside the portal, as in
  `CashFlowHistoryDetails` (`group/shell` + `data-private` from `useAdminUi().privacy.hidden`).
- **Forms**: Server Action + `useFormAction` (admin) → errors from the returned `FormState`,
  `aria-invalid` on the control, message in `FieldError`. Success closes the sheet, resets, and
  toasts the message; pass `undo` to add an "Undo" button (e.g. a new entry).
- **Destructive actions**: confirm in `AlertDialog`; never `window.confirm`. Exception: cheap,
  fully reversible deletes (single cash-flow entries) run straight away with an "Undo" toast
  (`RowActions onRestore`).
- **Data credits**: "Crypto prices by CoinGecko · FX by Frankfurter" sits at the bottom of Portfolio, where
  those prices show in detail (CoinGecko's free API asks for it); the admin has no footer.
- **Toasts never show amounts** that weren't typed by the user — they aren't blurred by privacy mode.
- **One screen**: `/admin` (Overview) shows everything at once — net worth and the month's numbers
  (`KpiStrip`: desktop tiles carry `MiniBars` with history captions; phones show a compact net-worth
  hero, one recorded-month card, then a separate income estimate without mini charts),
  then categories, the month's activity, accounts, and 12-month cash-flow history.
  It renders its own `AdminHeader` (the month, its coverage badge, the Needs you bell, Sync,
  Add); other pages get the shared one from `Shell`. From `xl` (1280px) it fills exactly one
  viewport (`Shell` locks the height on `/admin`; under 800px tall it scrolls as a page) and each
  `Panel fill` scrolls inside; populated months keep Activity and the chart full-height, with
  categories above Accounts in the left column so chart headers cannot squeeze the plot away.
  Empty months give Accounts the full right column and history a wide second row. Below `xl` it
  stacks in DOM order: categories, Activity, accounts, history. Synced
  accounts, recurring items and AI filing do the data entry, so a new panel has to earn its place.
  Deeper pages (Portfolio → Earnings/History, Connections, Recurring, Settings via the header gear,
  all of them via ⌘K) hang off the Overview with a `PageHeader back` link; there is no tab bar.
- **Quiet by default**: the headline tiles keep the hard border and offset shadow; panels are
  `Card variant="quiet"` (via `Panel fill`). Things that need a decision live behind the header's
  Needs you bell (a sheet): an account's alerts are grouped into one row (`groupAlerts`) with its fix
  in place (`SyncNowButton`, statement import) and a warning icon, not a badge per row; the Accounts
  panel shows no status badges: exclusions are persistent text beside the amount, and statement balances
  carry their as-of dates and a stale marker. A month without full statement coverage gets a clear
  "Statements missing" marker (`CoverageBadge`, with upload buttons), shown beside the month on
  desktop and in the recorded-month card on phones. Other panels use concise recorded-only context,
  not repeated provider paragraphs. Empty amounts are unknown (`—`), not zero; a net needs both sides, and charts keep
  unknown months as gaps (`dashboardMonth`). Rows show how the importer filed them as an icon
  (`filingNote`: AI, taught), not as text; inline pickers use `Button variant="subtle"`.
- **Variable income**: pay that changes with hours isn't scheduled or forecast. "Estimated income / mo"
  is each repeat payer's historical average plus active income schedules, with everyone's lowest and
  highest paid month as the estimated range (`typicalIncome`), not the selected month's actual earnings.
  Estimate/net-worth explanations use touch-accessible popovers. Cash-flow history has a read-only
  Details sheet as an alternative to hovering chart bars.
- **Filters**: Activity's type and category filters live in the URL but switch on the client
  (`useDashboardFilters`: `history.pushState`, so Back undoes them) because the month's entries are
  already on the page; month and search are links because they need new data. Category tabs and
  Activity share All/Spending/Income state; clearing a category retains its type. Choosing a month
  exits all-time search while keeping type/category. Search is labelled all months and offers an
  explicit return to the selected month. Empty states link to a month with records, not a blind prior month.
- **Adding entries**: manual entry is the exception. One `AddEntry` sheet in the Overview header
  (⌘K → Add expense/income opens it from anywhere via `?add=`) — don't build other add forms for
  cash flows. Changing just an entry's category goes through the row's `CategoryPicker`.
- **Write scope**: new entries still default to today; a date outside the viewed month gets a visible
  explanation. Budgets are category-level monthly defaults across all months, not historical overrides.
- **Accessibility**: every control has a label (`FieldLabel htmlFor` or `aria-label` on icon
  buttons); status text uses `role="status"`; don't remove focus rings. Panels have semantic headings
  and named regions. Category jumps move focus to Activity and respect reduced motion. Controlled
  row overlays and command dialogs restore the invoking control unless navigation took focus elsewhere.
  Mobile navigation stays visible; secondary utilities sit in More.
- **Dark mode**: never hard-code light/dark values in app code — tokens flip automatically.

## 5. UX council acceptance

`ux-scorecard.json` records 20 checks with evidence: data clarity, navigation, mobile usability,
accessibility, and hierarchy/recovery (four checks × 0.5 = 2 points each). `bun run ux:score` computes
the result; acceptance requires at least 9/10, at least 1.5 in every area, and no blocking defects.
Critical data-trust, primary-navigation, filter-scope and keyboard-restoration checks must pass.
Unknown checks earn no points. Browser checks and independent council review support the score;
unit tests verify behavior and prevent missing evidence, duplicate checks or blockers from being ignored.
This is a scoped product review, not a WCAG certification or a substitute for real-device testing.
