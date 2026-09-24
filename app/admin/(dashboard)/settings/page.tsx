import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCategories, getCategoryTotals, getCategoryUsage, getFxRows } from "@/lib/dal";
import { PROVIDER_META } from "@/lib/finance/connections/types";
import type { CashFlowKind } from "@/lib/finance/constants";
import { currentMonth, dayLabel } from "@/lib/finance/dates";
import { getCategoryRules } from "@/lib/finance/imports/dal";
import { deleteCategory, setCategoryArchived } from "../../_actions/categories";
import { BudgetsForm } from "../../_components/budgets-form";
import { CategoryForm } from "../../_components/category-form";
import { FormSheet } from "../../_components/form";
import { AddRuleButton, RuleToggle } from "../../_components/import-controls";
import { EditableRow } from "../../_components/row-actions";
import { Money, PageHeader, Panel } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const [categories, usage, fxRows, spent, rules] = await Promise.all([
    getCategories(),
    getCategoryUsage(),
    getFxRows(),
    getCategoryTotals("expense", currentMonth()),
    getCategoryRules(),
  ]);

  const categoryList = (kind: CashFlowKind) => (
    <ItemGroup>
      {categories
        .filter((c) => c.kind === kind)
        .map((c) => {
          const used = usage.get(c.id) ?? 0;
          return (
            <EditableRow
              key={c.id}
              name={c.name}
              editForm={<CategoryForm kind={kind} category={{ id: c.id, kind: c.kind, name: c.name, color: c.color, monthlyBudget: c.monthlyBudget }} />}
              archived={c.archived}
              onToggleArchive={setCategoryArchived.bind(null, c.id, !c.archived)}
              onDelete={used === 0 ? deleteCategory.bind(null, c.id) : undefined}
              media={
                <ItemMedia>
                  <Swatch color={c.color} />
                </ItemMedia>
              }
            >
              <ItemContent>
                <ItemTitle>
                  {c.name}
                  {c.archived && <Badge variant="outline">Archived</Badge>}
                </ItemTitle>
                <ItemDescription>
                  {used} {used === 1 ? "entry" : "entries"}
                  {kind === "expense" && c.monthlyBudget ? (
                    <>
                      {" · budget "}
                      <Money value={c.monthlyBudget} />
                    </>
                  ) : null}
                </ItemDescription>
              </ItemContent>
            </EditableRow>
          );
        })}
    </ItemGroup>
  );

  const addButton = (kind: CashFlowKind) => (
    <FormSheet
      title={kind === "expense" ? "New expense category" : "New income category"}
      trigger={
        <Button variant="outline" size="sm">
          <Plus /> Add
        </Button>
      }
    >
      <CategoryForm kind={kind} />
    </FormSheet>
  );

  return (
    <>
      <PageHeader eyebrow="Setup" title="Settings" />

      <div className="mb-6">
        <Panel title="Account connections" action={<Button asChild variant="outline"><Link href="/admin/connections">Manage connections</Link></Button>}>
          <p className="text-sm text-muted-foreground">Sync Binance Spot and Simple Earn, IBKR investments and cash, and eligible Wise balances automatically.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href="/admin/earnings">Earnings</Link></Button><Button asChild variant="outline" size="sm"><Link href="/admin/notifications">Notifications</Link></Button></div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Expense categories & budgets"
          action={
            <div className="flex items-center gap-2">
              <FormSheet
                title="Monthly budgets"
                description="Per expense category, in PHP. Leave blank for no budget."
                trigger={
                  <Button variant="ghost" size="sm">
                    <SlidersHorizontal /> Budgets
                  </Button>
                }
              >
                <BudgetsForm
                  categories={categories
                    .filter((c) => c.kind === "expense" && !c.archived)
                    .map((c) => ({ id: c.id, name: c.name, budget: c.monthlyBudget, spent: spent.get(c.id) ?? 0 }))}
                />
              </FormSheet>
              {addButton("expense")}
            </div>
          }
        >
          {categoryList("expense")}
        </Panel>
        <Panel title="Income categories" action={addButton("income")}>
          {categoryList("income")}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="Category rules" action={<AddRuleButton categories={categories} />}>
          <p className="mb-4 text-sm text-muted-foreground">
            Imports and syncs run your rules first, then AI files everything else. Use a rule only when you want a merchant pinned to one category.
          </p>
          {!rules.length ? (
            <p className="text-sm text-muted-foreground">No rules. AI categorizes all imported activity.</p>
          ) : (
            <ItemGroup>
              {rules.map((r) => (
                <Item key={r.id} size="sm">
                  <ItemContent>
                    <ItemTitle>“{r.contains}” → {categories.find((c) => c.id === r.categoryId)?.name ?? "Unavailable category"}</ItemTitle>
                    <ItemDescription>
                      {r.provider ? PROVIDER_META[r.provider].name : "Any provider"} · {r.kind} · {r.autoPost ? "Posts automatically" : "Left to AI"} · {r.enabled ? "Active" : "Paused"}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <RuleToggle id={r.id} enabled={r.enabled} />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Backup">
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">
              Download everything — holdings, entries, debts, categories and history — as JSON. Neon&apos;s free plan only keeps a
              few hours of restore history, so grab a copy now and then.
            </p>
            <Button asChild variant="outline">
              <a href="/admin/export" download>
                <Download /> Export JSON
              </a>
            </Button>
          </div>
        </Panel>
        <Panel title="FX rates → PHP">
          {fxRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Fetched automatically for every non-PHP currency you use.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead>ECB date</TableHead>
                  <TableHead className="text-right">PHP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fxRows.map((r) => (
                  <TableRow key={r.currency}>
                    <TableCell className="font-mono font-bold">{r.currency}</TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">{dayLabel(r.asOf)}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">₱{r.rateToPhp.toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>
    </>
  );
}
