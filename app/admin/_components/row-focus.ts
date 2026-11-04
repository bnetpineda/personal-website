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
  const { trigger, href, main, next, previous } = target;
  const doc = trigger.ownerDocument;
  // A route change can unmount the row before Next has finished managing the new page's focus.
  if (doc.location.href !== href || (main && !main.isConnected)) return;
  const active = doc.activeElement;
  const overlay = event.target as HTMLElement | null;
  // Do not take focus back from a new dialog, navigation, or a control the user already reached.
  if (active && active !== doc.body && active !== doc.documentElement && active !== trigger && !overlay?.contains(active)) return;

  if (focusControl(trigger) || next.some((control) => focusControl(control))) return;
  const activity = main?.querySelector<HTMLElement>("#activity");
  const heading = activity?.querySelector<HTMLElement>('h2, [role="heading"], [data-slot="card-title"]');
  if (focusControl(heading, true) || previous.some((control) => focusControl(control))) return;
  if (focusControl(main?.querySelector<HTMLElement>("h1"), true)) return;
  focusControl(main, true);
}
