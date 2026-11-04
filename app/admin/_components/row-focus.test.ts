import { describe, expect, mock, test } from "bun:test";
import { captureRowFocus, restoreRowFocus } from "./row-focus";

// A DOM-only fixture: these tests never import forms, server actions, or financial data.
class FocusDocument {
  location = { href: "https://example.test/admin" };
  body = new FocusElement(this);
  documentElement = new FocusElement(this);
  activeElement: FocusElement = this.body;
}

class FocusElement extends EventTarget {
  isConnected = true;
  disabled = false;
  blocked = false;
  visible = true;
  tabIndex = 0;
  main: FocusElement | null = null;
  list: FocusElement | null = null;
  controls: FocusElement[] = [];
  queries = new Map<string, FocusElement>();
  attributes = new Map<string, string>();
  children = new Set<FocusElement>();
  focus = mock(() => { this.ownerDocument.activeElement = this; });

  constructor(public ownerDocument: FocusDocument) { super(); }
  closest(selector: string) {
    if (selector === "main") return this.main;
    if (selector === '[role="list"], tbody') return this.list;
    return this.blocked ? this : null;
  }
  matches() { return this.disabled; }
  getClientRects() { return this.visible ? [{}] : []; }
  querySelector(selector: string) { return this.queries.get(selector) ?? null; }
  querySelectorAll() { return this.controls; }
  contains(element: FocusElement) { return this === element || this.children.has(element); }
  hasAttribute(name: string) { return this.attributes.has(name); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  asElement() { return this as unknown as HTMLElement; }
}

function fixture() {
  const doc = new FocusDocument();
  const main = new FocusElement(doc);
  const list = new FocusElement(doc);
  const row = new FocusElement(doc);
  const menu = new FocusElement(doc);
  const next = new FocusElement(doc);
  const activity = new FocusElement(doc);
  const heading = new FocusElement(doc);
  heading.tabIndex = -1;
  main.tabIndex = -1;
  main.queries.set("#activity", activity);
  activity.queries.set('h2, [role="heading"], [data-slot="card-title"]', heading);
  list.controls = [row, menu, next];
  for (const control of list.controls) {
    control.main = main;
    control.list = list;
  }
  const capture = (control: FocusElement) => captureRowFocus(control.asElement());
  const close = (target: ReturnType<typeof captureRowFocus>, overlay?: FocusElement) => {
    const event = new Event("closeAutoFocus", { cancelable: true });
    if (overlay) Object.defineProperty(event, "target", { value: overlay });
    restoreRowFocus(target, event);
    return event;
  };
  return { doc, main, list, row, menu, next, activity, heading, capture, close };
}

describe("row overlay focus restoration", () => {
  test("a direct edit returns to its actual row button", () => {
    const { doc, row, menu, capture, close } = fixture();
    const event = close(capture(row));
    expect(doc.activeElement).toBe(row);
    expect(row.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(menu.focus).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  test("menu-opened edit, extra sheet, or confirmation returns to the menu trigger", () => {
    const { doc, row, menu, capture, close } = fixture();
    close(capture(menu));
    expect(doc.activeElement).toBe(menu);
    expect(row.focus).not.toHaveBeenCalled();
  });

  test("a deleted opener falls forward to the next meaningful row", () => {
    const { doc, row, menu, next, capture, close } = fixture();
    const target = capture(row);
    row.isConnected = menu.isConnected = false;
    close(target);
    expect(doc.activeElement).toBe(next);
  });

  test("an empty Activity list falls back to its heading and cleans up tabindex on blur", () => {
    const { doc, row, menu, next, heading, capture, close } = fixture();
    const target = capture(menu);
    row.isConnected = menu.isConnected = next.isConnected = false;
    close(target);
    expect(doc.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    heading.dispatchEvent(new Event("blur"));
    expect(heading.hasAttribute("tabindex")).toBe(false);
  });

  test("existing heading tabindex is preserved", () => {
    const { row, menu, next, heading, capture, close } = fixture();
    const target = capture(menu);
    row.isConnected = menu.isConnected = next.isConnected = false;
    heading.setAttribute("tabindex", "-1");
    close(target);
    heading.dispatchEvent(new Event("blur"));
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  test("a page without Activity uses a surviving previous row", () => {
    const { doc, main, row, menu, next, capture, close } = fixture();
    const target = capture(next);
    main.queries.clear();
    menu.isConnected = next.isConnected = false;
    close(target);
    expect(doc.activeElement).toBe(row);
  });

  test("an empty non-Activity page uses its page heading", () => {
    const { doc, main, row, menu, next, capture, close } = fixture();
    const target = capture(menu);
    const heading = new FocusElement(doc);
    heading.tabIndex = -1;
    main.queries.clear();
    main.queries.set("h1", heading);
    row.isConnected = menu.isConnected = next.isConnected = false;
    close(target);
    expect(doc.activeElement).toBe(heading);
  });

  test("disabled, hidden, inert, or disconnected controls are not focused", () => {
    const { doc, row, menu, next, heading, capture, close } = fixture();
    const target = capture(row);
    row.disabled = true;
    menu.blocked = true;
    next.visible = false;
    close(target);
    expect(doc.activeElement).toBe(heading);
    expect(row.focus).not.toHaveBeenCalled();
    expect(menu.focus).not.toHaveBeenCalled();
    expect(next.focus).not.toHaveBeenCalled();
  });

  test("pathname and query navigation are left alone", () => {
    for (const href of ["https://example.test/admin/settings", "https://example.test/admin?month=2026-10"]) {
      const { doc, row, capture, close } = fixture();
      const target = capture(row);
      doc.location.href = href;
      close(target);
      expect(doc.activeElement).toBe(doc.body);
      expect(row.focus).not.toHaveBeenCalled();
    }
  });

  test("unmounting the old page does not focus controls on a new page", () => {
    const { doc, main, row, capture, close } = fixture();
    const target = capture(row);
    main.isConnected = false;
    close(target);
    expect(doc.activeElement).toBe(doc.body);
  });

  test("focus intentionally moved outside the closing overlay is not stolen", () => {
    const { doc, row, capture, close } = fixture();
    const target = capture(row);
    const otherControl = new FocusElement(doc);
    doc.activeElement = otherControl;
    close(target, new FocusElement(doc));
    expect(doc.activeElement).toBe(otherControl);
  });

  test("focus still inside the closing overlay returns to its opener", () => {
    const { doc, row, capture, close } = fixture();
    const target = capture(row);
    const overlay = new FocusElement(doc);
    const field = new FocusElement(doc);
    overlay.children.add(field);
    doc.activeElement = field;
    close(target, overlay);
    expect(doc.activeElement).toBe(row);
  });

  test("an already-cancelled autofocus event is respected", () => {
    const { doc, row, capture } = fixture();
    const event = new Event("closeAutoFocus", { cancelable: true });
    event.preventDefault();
    restoreRowFocus(capture(row), event);
    expect(doc.activeElement).toBe(doc.body);
  });
});
