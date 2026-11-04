import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@/components/ui/button";
import { EmptyState, Money, Panel } from "./ui";

describe("dashboard UI accessibility contracts", () => {
  test("a filter destination is a labelled region with a focusable semantic heading", () => {
    const html = renderToStaticMarkup(<Panel id="activity" title="Recorded activity" focusableHeading>Records</Panel>);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-labelledby="activity-heading"');
    expect(html).toContain('<h2 id="activity-heading" tabindex="-1"');
  });

  test("layout wrappers retain their accessible section label", () => {
    const html = renderToStaticMarkup(<Panel id="accounts" title="Accounts" className="min-w-0">Balances</Panel>);
    expect(html).toContain('<section id="accounts" aria-labelledby="accounts-heading"');
    expect(html).toContain('<h2 id="accounts-heading"');
  });

  test("an empty state can offer an actionable recovery without hiding its explanation", () => {
    const html = renderToStaticMarkup(<EmptyState title="No records" action={<Button>Import statements</Button>}>Missing records are not zero totals.</EmptyState>);
    expect(html).toContain("Missing records are not zero totals.");
    expect(html).toContain('data-slot="empty-content"');
    expect(html).toContain("Import statements");
  });

  test("touch targets are opt-in and the styling prop never leaks onto the DOM", () => {
    const touch = renderToStaticMarkup(<Button size="xs" touch>Category</Button>);
    const normal = renderToStaticMarkup(<Button size="xs">Category</Button>);
    expect(touch).toContain("pointer-coarse:min-h-11");
    expect(touch).toContain("pointer-coarse:min-w-11");
    expect(touch).not.toContain("touch=");
    expect(normal).not.toContain("pointer-coarse:min-h-11");
  });

  test("money still participates in the shared privacy mode", () => {
    const html = renderToStaticMarkup(<Money value={1234.5} />);
    expect(html).toContain("1,234.50");
    expect(html).toContain("group-data-[private=true]/shell:blur-sm");
  });
});
