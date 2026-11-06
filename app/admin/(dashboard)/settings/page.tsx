import type { Metadata } from "next";
import { Download, Plus, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { getCategories, getCategoryTotals, getCategoryUsage, getMonthBudgets } from "@/lib/dal";
import { PROVIDER_META } from "@/lib/finance/connections/types";
import type { CashFlowKind } from "@/lib/finance/constants";
import { currentMonth } from "@/lib/finance/dates";
import { getCategoryRules } from "@/lib/finance/imports/dal";
import { deleteCategory, setCategoryArchived } from "../../_actions/categories";
import { BudgetsForm } from "../../_components/budgets-form";
import { CategoryForm } from "../../_components/category-form";
import { FormSheet } from "../../_components/form";
import { AddRuleButton, RuleToggle } from "../../_components/import-controls";
import { RestoreBackup } from "../../_components/restore-backup";
import { EditableRow } from "../../_components/row-actions";
import { SignOutEverywhere } from "../../_components/sign-out-everywhere";
import { Money, PageHeader, Panel } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const month = currentMonth();
  const [categories, usage, spent, rules, monthBudgets] = await Promise.all([
    getCategories(),
    getCategoryUsage(),
    getCategoryTotals("expense", month),
    getCategoryRules(),
    getMonthBudgets(month),
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
        <Button variant="outline" size="sm" aria-label={kind === "expense" ? "Add spending category" : "Add income category"}>
          <Plus /> Add
        </Button>
      }
    >
      <CategoryForm kind={kind} />
    </FormSheet>
  );

  return (
    <>
      <PageHeader title="Settings" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Spending categories"
          action={
            <div className="flex items-center gap-2">
              <FormSheet
                title="Budgets"
                description="Set defaults for every month, or budgets for this month only. Amounts are in PHP."
                trigger={
                  <Button variant="ghost" size="sm">
                    <SlidersHorizontal /> Budgets
                  </Button>
                }
              >
                <BudgetsForm
                  month={month}
                  categories={categories
                    .filter((c) => c.kind === "expense" && !c.archived)
                    .map((c) => ({ id: c.id, name: c.name, budget: c.monthlyBudget, override: monthBudgets.has(c.id) ? (monthBudgets.get(c.id) ?? null) : undefined, spent: spent.get(c.id) ?? 0 }))}
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
            AI files imported entries. Add a rule only to pin a merchant to one category.
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
                      {r.provider ? PROVIDER_META[r.provider].name : "Any account"} · {r.kind} · {r.autoPost ? "Posts automatically" : "Left to AI"} · {r.enabled ? "Active" : "Paused"}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <RuleToggle id={r.id} enabled={r.enabled} name={r.contains} />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="Backup">
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">
              Download everything as a JSON file. Grab a copy now and then. Restoring one only adds what&apos;s missing.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a href="/admin/export" download>
                  <Download /> Export JSON
                </a>
              </Button>
              <RestoreBackup />
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="Sign-in">
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">Lost a phone or signed in somewhere shared? End every session, this one included.</p>
            <SignOutEverywhere />
          </div>
        </Panel>
      </div>
    </>
  );
}
