/** A row's opener and nearby controls, captured before a portalled overlay takes focus. */
export interface RowFocusReturn {
  trigger: HTMLElement;
  href: string;
  main: HTMLElement | null;
  next: HTMLElement[];
  previous: HTMLElement[];
}

export function captureRowFocus(trigger: HTMLElement | null): RowFocusReturn | null {
  if (!trigger) return null;
  const main = trigger.closest<HTMLElement>("main");
  const list = trigger.closest<HTMLElement>('[role="list"], tbody') ?? main;
  const controls = Array.from(list?.querySelectorAll<HTMLElement>("[data-row-focus]") ?? []);
  const index = controls.indexOf(trigger);
  return {
    trigger,
    href: trigger.ownerDocument.location.href,
    main,
    next: index < 0 ? [] : controls.slice(index + 1),
    previous: index < 0 ? [] : controls.slice(0, index).reverse(),
  };
}

function focusControl(element: HTMLElement | null | undefined, temporaryTabIndex = false): boolean {
  if (!element?.isConnected || element.matches(':disabled, [aria-disabled="true"]') || element.closest('[hidden], [inert], [aria-hidden="true"]') || element.getClientRects().length === 0) return false;
  const addedTabIndex = temporaryTabIndex && !element.hasAttribute("tabindex") && element.tabIndex < 0;
  if (addedTabIndex) element.setAttribute("tabindex", "-1");
  element.focus({ preventScroll: true });
  const focused = element.ownerDocument.activeElement === element;
  if (addedTabIndex) {
    const cleanup = () => {
      if (element.getAttribute("tabindex") === "-1") element.removeAttribute("tabindex");
    };
    if (focused) element.addEventListener("blur", cleanup, { once: true });
    else cleanup();
  }
  return focused;
}

/** Used only by triggerless row overlays; ordinary FormSheet keeps Radix's default behavior. */
export function restoreRowFocus(target: RowFocusReturn | null, event: Event): void {
  if (event.defaultPrevented) return;
  event.preventDefault();
  if (!target) return;
  const { trigger, href, main } = target;
  const doc = trigger.ownerDocument;
  // A route change can unmount the row before Next has finished managing the new page's focus.
  if (doc.location.href !== href || (main && !main.isConnected)) return;
  const active = doc.activeElement;
  const overlay = event.target as HTMLElement | null;
  // Do not take focus back from a new dialog, navigation, or a control the user already reached.
  if (active && active !== doc.body && active !== doc.documentElement && active !== trigger && !overlay?.contains(active)) return;

  if (focusControl(trigger)) return;
  focusNearby(target);
}

/** The next row, else Activity's heading, a previous row, the page heading, then the page itself. */
function focusNearby({ main, next, previous }: RowFocusReturn): void {
  if (next.some((control) => focusControl(control))) return;
  const activity = main?.querySelector<HTMLElement>("#activity");
  const heading = activity?.querySelector<HTMLElement>('h2, [role="heading"], [data-slot="card-title"]');
  if (focusControl(heading, true) || previous.some((control) => focusControl(control))) return;
  if (focusControl(main?.querySelector<HTMLElement>("h1"), true)) return;
  focusControl(main, true);
}

/**
 * After a row is deleted and the page re-renders without it, keyboard focus would fall to the page.
 * Returns false while the row is still there (call again later); true once it has handled it, moving
 * focus to the nearest row only if focus was lost with the row, never away from somewhere the user went.
 */
export function focusAfterRemoval(target: RowFocusReturn): boolean {
  const { trigger, href, main } = target;
  if (trigger.isConnected) return false;
  const doc = trigger.ownerDocument;
  if (doc.location.href !== href || (main && !main.isConnected)) return true;
  const active = doc.activeElement;
  const lost = !active || active === doc.body || active === doc.documentElement || !active.isConnected;
  if (lost) focusNearby(target);
  return true;
}

/** Waits (up to a few seconds) for a deleted row to leave the page, then keeps focus nearby. */
export function keepFocusAfterRemoval(target: RowFocusReturn | null, timeoutMs = 4000): void {
  if (!target) return;
  const started = Date.now();
  const check = () => {
    if (focusAfterRemoval(target) || Date.now() - started > timeoutMs) return;
    setTimeout(check, 50);
  };
  check();
}
