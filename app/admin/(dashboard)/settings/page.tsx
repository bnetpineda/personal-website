import type { Metadata } from "next";
import { Download, Plus, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCategories, getCategoryTotals, getCategoryUsage, getFxRows } from "@/lib/dal";
import type { CashFlowKind } from "@/lib/finance/constants";
import { currentMonth, dayLabel } from "@/lib/finance/dates";
import { deleteCategory, setCategoryArchived } from "../../_actions/categories";
import { BudgetsForm } from "../../_components/budgets-form";
import { CategoryForm } from "../../_components/category-form";
import { FormSheet } from "../../_components/form";
import { EditableRow } from "../../_components/row-actions";
import { Money, PageHeader, Panel } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const [categories, usage, fxRows, spent] = await Promise.all([
    getCategories(),
    getCategoryUsage(),
    getFxRows(),
    getCategoryTotals("expense", currentMonth()),
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
