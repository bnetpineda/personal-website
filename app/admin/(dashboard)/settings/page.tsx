import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download, Link2, Plus, Repeat, SlidersHorizontal, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Swatch } from "@/components/ui/swatch";
import { getCategories, getCategoryTotals, getCategoryUsage, getConnections, getRecurring } from "@/lib/dal";
import { PROVIDER_META } from "@/lib/finance/connections/types";
import type { CashFlowKind } from "@/lib/finance/constants";
import { currentMonth } from "@/lib/finance/dates";
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
  const [categories, usage, spent, rules, connections, recurring] = await Promise.all([
    getCategories(),
    getCategoryUsage(),
    getCategoryTotals("expense", currentMonth()),
    getCategoryRules(),
    getConnections(),
    getRecurring(),
  ]);
  const activeRecurring = recurring.filter((r) => !r.paused && r.nextOn != null).length;

  const sections = [
    {
      href: "/admin/connections",
      icon: <Link2 />,
      title: "Connected accounts",
      description: connections.length
        ? `${connections.map((c) => PROVIDER_META[c.provider].name).join(", ")} · sync daily, import Wise CSVs`
        : "Connect Wise, Binance or IBKR to track balances automatically",
    },
    {
      href: "/admin/recurring",
      icon: <Repeat />,
      title: "Recurring",
      description: activeRecurring ? `${activeRecurring} active · salary, rent and bills log themselves` : "Salary, rent and bills that log themselves",
    },
    {
      href: "/admin/holdings",
      icon: <Wallet />,
      title: "Holdings & investments",
      description: "Positions, P/L, allocation, earnings and history",
    },
  ];

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
        <Panel title="Automation">
          <ItemGroup>
            {sections.map((section) => (
              <Item key={section.href} size="sm" asChild>
                <Link href={section.href}>
                  <ItemMedia variant="icon">{section.icon}</ItemMedia>
                  <ItemContent>
                    <ItemTitle>{section.title}</ItemTitle>
                    <ItemDescription>{section.description}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ChevronRight />
                  </ItemActions>
                </Link>
              </Item>
            ))}
          </ItemGroup>
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

      <div className="mt-6">
        <Panel title="Backup">
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-muted-foreground">
              Download everything as JSON. Neon&apos;s free plan only keeps a few hours of restore history, so grab a copy now
              and then.
            </p>
            <Button asChild variant="outline">
              <a href="/admin/export" download>
                <Download /> Export JSON
              </a>
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
