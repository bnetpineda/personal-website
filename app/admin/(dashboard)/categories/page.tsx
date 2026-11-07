import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { getCategories, getCategoryUsage } from "@/lib/dal";
import { PROVIDER_META } from "@/lib/finance/connections/types";
import type { CashFlowKind } from "@/lib/finance/constants";
import { getCategoryRules } from "@/lib/finance/imports/dal";
import { deleteCategory, setCategoryArchived } from "../../_actions/categories";
import { CategoryForm } from "../../_components/category-form";
import { FormSheet } from "../../_components/form";
import { AddRuleButton, RuleToggle } from "../../_components/import-controls";
import { EditableRow } from "../../_components/row-actions";
import { Money, PageHeader, Panel } from "../../_components/ui";

export const metadata: Metadata = {
  title: "Categories",
};

/**
 * The categories entries are filed under, and the rules that pin a merchant to one. Rarely needed, so
 * it isn't in the main navigation: the Overview's By category panel and ⌘K open it. Budgets stay on
 * the Overview, beside the spending they limit.
 */
export default async function CategoriesPage() {
  const [categories, usage, rules] = await Promise.all([getCategories(), getCategoryUsage(), getCategoryRules()]);

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
      <PageHeader title="Categories" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Spending categories" action={addButton("expense")}>
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
    </>
  );
}
