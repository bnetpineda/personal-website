/*
 * Read-only usability probe for /admin, run in BrowserOS neo as a saved helper (see the
 * /neo-admin-ux-score task). It walks the real UI and returns raw numbers for
 * scripts/admin-usability.ts to score.
 *
 * It runs against live financial data, so it never finishes a write: the last step of a task that
 * would save, sync, dismiss or upload is counted but not performed. The only submit is a deliberately
 * invalid amount, which validation rejects before any database call. Results hold counts and static
 * names only, never amounts or entry text.
 *
 * Two guards keep that true (an earlier version's blind phone tap is the likely cause of one unintended
 * IBKR sync): press() refuses any control whose name could write, and phone viewports activate the exact
 * named control instead of tapping coordinates.
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */
(async (browser, page, inputs = {}) => {
  const BASE = inputs.base ?? "http://localhost:4101";
  const PAGE_PATHS = { overview: "/admin", portfolio: "/admin/holdings", earnings: "/admin/earnings", history: "/admin/history", recurring: "/admin/recurring", accounts: "/admin/connections", settings: "/admin/settings" };

  let phone = false;
  const setViewport = async (viewport) => {
    phone = viewport === "phone";
    if (viewport === "phone") {
      await page.cdp("Emulation.setDeviceMetricsOverride", JSON.stringify({ width: 390, height: 844, deviceScaleFactor: 1, mobile: true }));
      await page.cdp("Emulation.setTouchEmulationEnabled", JSON.stringify({ enabled: true, maxTouchPoints: 5 }));
    } else if (viewport === "desktop") {
      await page.cdp("Emulation.setTouchEmulationEnabled", JSON.stringify({ enabled: false }));
      await page.cdp("Emulation.setDeviceMetricsOverride", JSON.stringify({ width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }));
    } else {
      await page.cdp("Emulation.setTouchEmulationEnabled", JSON.stringify({ enabled: false }));
      await page.cdp("Emulation.clearDeviceMetricsOverride", "{}");
    }
  };

  const open = async (path) => {
    await page.goto(BASE + path);
    await page.waitForSelector("main h1");
  };

  const evaluate = async (fn, arg) => (await page.evaluateInPage(fn, arg)).value;

  /** "October 2026", built by hand: the sandbox's Date can't parse month names. */
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const parseLabel = (label) => { const [name, year] = label.split(" "); return { month: MONTHS.indexOf(name), year: Number(year) }; };
  const labelOf = (year, month) => { const index = year * 12 + month; return MONTHS[index % 12] + " " + Math.floor(index / 12); };

  const controls = async () => {
    const snap = await page.snapshot({ mode: "interactive" });
    return snap.text.split("\n").map((line) => line.match(/^\s*- (\S+)(?: "((?:[^"\\]|\\.)*)")?.*?\[ref=(e\d+)\]/)).filter(Boolean).map((m) => ({ role: m[1], name: (m[2] ?? "").trim(), ref: m[3] }));
  };

  /** Controls can arrive a moment after a navigation streams in, so give each a few looks. */
  const find = async (re, roles, tries = 5) => {
    for (let i = 0; i < tries; i++) {
      const hits = (await controls()).filter((c) => re.test(c.name) && (!roles || roles.includes(c.role)));
      // On a phone the bottom bar comes last in the page and needs no scrolling.
      if (hits.length) return phone ? hits[hits.length - 1] : hits[0];
      await sleep(300);
    }
    throw new Error("no control " + re);
  };

  const WRITES = /sync|delete|dismiss|disconnect|post|save|import|resume|pause|reconnect now/i;

  /**
   * On a phone viewport the control is activated directly: emulated touch coordinates don't land
   * reliably under emulation, and a stray tap on live data could hit Sync. Tap sizes are measured
   * separately; real-device touch isn't something this probe can vouch for.
   */
  const press = async (control) => {
    if (WRITES.test(control.name)) throw new Error("refusing to press a control that could write: " + control.role);
    if (!phone) return page.click(control.ref);
    const { backendNodeId } = await page.resolveRef(control.ref);
    const resolved = await page.cdp("DOM.resolveNode", JSON.stringify({ backendNodeId }));
    const { object } = typeof resolved === "string" ? JSON.parse(resolved) : resolved;
    await page.cdp("Runtime.callFunctionOn", JSON.stringify({ objectId: object.objectId, functionDeclaration: "function () { this.click(); }" }));
  };

  const dialogOpen = () => evaluate(() => Boolean(document.querySelector("[role=dialog]")));

  const CHECKS = {
    kpis: () => evaluate(() => {
      const text = document.querySelector("main")?.innerText ?? "";
      const dashes = (text.match(/(^|\n)(spent|earned|income)[^\n]*\n+\s*—/gi) ?? []).length;
      return /(spent)/i.test(text) && dashes < 2;
    }),
    /** Open, and done sliding in: an occluded browser window doesn't tick animations, and the snapshot skips what's off screen. */
    dialog: async () => {
      if (!(await dialogOpen())) return false;
      await evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* A looping animation, like a loading skeleton, has no end. */ } }));
      await sleep(200);
      return true;
    },
    /** Every alert's text can be read where it is, with nothing cut off. */
    alertsReadable: () => evaluate(() => {
      const dialog = document.querySelector("[role=dialog]");
      if (!dialog) return false;
      return ![...dialog.querySelectorAll("*")].some((el) => {
        const s = getComputedStyle(el);
        // Screen-reader-only text is 1px on purpose; it isn't cut off for anyone.
        if (el.clientWidth <= 1 || el.clientHeight <= 1) return false;
        return (s.webkitLineClamp !== "none" || s.overflow === "hidden" || s.textOverflow === "ellipsis") && el.innerText?.trim() && !el.querySelector("[data-slot=scroll-area-viewport]") && el.getAttribute("data-slot") !== "scroll-area" && el.getAttribute("data-slot") !== "sheet-content" && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
      });
    }),
  };

  /** One step of a path. Returns how many user actions it took. */
  const step = async (s) => {
    if (s.count != null) return s.count;
    if (s.c) { await press(await find(s.c, s.r, s.tries)); return s.free ? 0 : 1; }
    if (s.f) { await page.fill((await find(s.f, s.r)).ref, s.v); return 1; }
    if (s.k) { await page.press(s.k); return 1; }
    if (s.exists) { await find(s.exists, s.r); return 0; }
    if (s.goto) { await open(s.goto); return 0; }
    if (s.at) {
      for (let i = 0; i < 25; i++) { const { url } = await page.info(); if (s.at.test(url)) { await page.waitForSelector("main h1"); return 0; } await sleep(250); }
      throw new Error("never reached " + s.at);
    }
    if (s.check) {
      for (let i = 0; i < 8; i++) { if (await CHECKS[s.check]()) return 0; await sleep(250); }
      throw new Error("check failed: " + s.check);
    }
    throw new Error("unknown step");
  };

  const LINK = ["link"];
  const FIELD = ["textbox", "searchbox", "combobox"];
  const nav = (name, url, viewport) => ({
    start: "/admin",
    viewport,
    paths: [
      [{ c: name, r: LINK, tries: 2 }, { at: url }],
      // No visible link: open the search palette and pick it from the list.
      [{ c: /^open navigation/i, r: ["button"], tries: 2 }, { exists: name, r: ["option"] }, { count: 1 }],
    ],
  });
  const PORTFOLIO = /^portfolio\b/i, RECURRING = /^recurring\b/i, ACCOUNTS = /^(accounts|connected accounts|connections)\b/i, SETTINGS = /^settings$/i;
  const ADD = /^\+?\s*add$/i;
  const NEEDS = /^needs you/i;
  const seeMonth = (viewport) => ({ start: "/admin", viewport, paths: [[{ check: "kpis" }], [{ exists: /^view .*20\d\d$/i, r: LINK }, { count: 1 }]] });
  const addAnywhere = (viewport) => ({
    start: "/admin/recurring",
    viewport,
    paths: [[{ c: ADD, r: [...LINK, "button"] }, { check: "dialog" }], [{ c: /^open navigation/i }, { c: /^add expense/i, r: ["option"] }, { check: "dialog" }]],
  });
  const explainAlert = (viewport) => ({ start: "/admin", viewport, paths: [[{ c: NEEDS }, { check: "alertsReadable" }], [{ c: NEEDS }, { check: "dialog" }, { count: 1 }]] });
  const searchEntry = (viewport) => ({ start: "/admin", viewport, paths: [[{ count: 1 }, { f: /^search entries$/i, r: FIELD, v: "a" }, { k: "Enter" }, { at: /[?&]q=a/ }]] });

  const TASKS = {
    "see-month": seeMonth("desktop"),
    "go-portfolio": nav(PORTFOLIO, /\/admin\/holdings/, "desktop"),
    "go-recurring": nav(RECURRING, /\/admin\/recurring/, "desktop"),
    "go-accounts": nav(ACCOUNTS, /\/admin\/connections/, "desktop"),
    "go-settings": nav(SETTINGS, /\/admin\/settings/, "desktop"),
    "reach-earnings": { start: "/admin", viewport: "desktop", paths: [[{ c: /^earnings$/i, r: LINK }, { at: /\/admin\/earnings/ }], [{ c: PORTFOLIO, r: LINK }, { at: /holdings/ }, { c: /^earnings$/i, r: LINK }, { at: /\/admin\/earnings/ }]] },
    "add-expense": { start: "/admin", viewport: "desktop", paths: [[{ c: ADD, r: ["button"] }, { check: "dialog" }, { f: /^amount$/i, r: FIELD, v: "1" }, { exists: /^(?!expense$|income$|today$|yesterday$|all$|spent$|earned$|spending$).+/i, r: ["radio"] }, { count: 1 }, { exists: /^add expense$/i, r: ["button"] }, { count: 1 }]] },
    "add-anywhere": addAnywhere("desktop"),
    "search-entry": searchEntry("desktop"),
    "this-month": { start: "/admin?month=2026-03", viewport: "desktop", paths: [[{ c: /^(this month|go to \w+ \d{4})$/i }, { at: /\/admin(\?|$)/ }]] },
    "filter-category": { start: "/admin", viewport: "desktop", paths: [[{ c: /^show activity for/i }, { c: /^show all categories|^show activity for/i }]] },
    "history-by-type": { start: "/admin/history", viewport: "desktop", paths: [[{ c: /^fees$/i, r: LINK }, { at: /type=fee/ }]] },
    "move-category": { start: "/admin", viewport: "desktop", paths: [[{ c: /^category for /i }, { exists: /./, r: ["menuitemradio"] }, { count: 1 }], [{ c: /^view .*20\d\d$/i, r: LINK }, { c: /^category for /i }, { exists: /./, r: ["menuitemradio"] }, { count: 1 }]] },
    "edit-budget": { start: "/admin", viewport: "desktop", paths: [[{ c: /^budgets$/i }, { exists: /\(php\)/i, r: FIELD }, { count: 2 }]] },
    "explain-alert": explainAlert("desktop"),
    "upload-statement": { start: "/admin", viewport: "desktop", paths: [[{ c: NEEDS }, { exists: /^import (csvs|pdfs)/i, r: ["button"] }, { count: 1 }]] },
    "hide-amounts": { start: "/admin", viewport: "desktop", paths: [[{ c: /^hide amounts$/i }, { c: /^show amounts$/i, free: true }]] },
    "p-see-month": seeMonth("phone"),
    "p-go-portfolio": nav(PORTFOLIO, /\/admin\/holdings/, "phone"),
    "p-go-recurring": nav(RECURRING, /\/admin\/recurring/, "phone"),
    "p-go-accounts": nav(ACCOUNTS, /\/admin\/connections/, "phone"),
    "p-go-settings": nav(SETTINGS, /\/admin\/settings/, "phone"),
    "p-add-anywhere": addAnywhere("phone"),
    "p-explain-alert": explainAlert("phone"),
    "p-search-entry": searchEntry("phone"),
  };

  const runTask = async (id, task) => {
    if (task.viewport) await setViewport(task.viewport);
    const errors = [];
    for (const [i, path] of task.paths.entries()) {
      await open(task.start);
      try {
        let actions = 0;
        for (const s of path) actions += await step(s);
        return { actions, path: i };
      } catch (e) { errors.push(String(e.message ?? e).slice(0, 90)); }
    }
    return { actions: null, error: errors.join(" | ") };
  };

  /** The month on opening, then six months back: the only task whose path depends on the data. */
  const jumpMonth = async () => {
    await setViewport("desktop");
    await open("/admin");
    const label = await evaluate(() => document.querySelector("main h1")?.innerText.split("·").pop().trim());
    const start = parseLabel(label);
    const name = new RegExp("^" + labelOf(start.year, start.month - 6) + "$", "i");
    try {
      await page.click((await find(/^choose month|^month:/i, ["button"], 2)).ref);
      await find(name, [...LINK, "menuitem", "button", "option"], 3);
      return { actions: 2, path: 0 };
    } catch { /* No picker: step back one at a time. */ }
    try {
      await open("/admin");
      // One click proves the route; the other five are the same click (six page loads don't fit one run).
      await page.click((await find(/^previous month$/i, LINK)).ref);
      const reached = labelOf(start.year, start.month - 1);
      for (let t = 0; t < 30 && !(await evaluate((m) => document.querySelector("main h1")?.innerText.includes(m), reached)); t++) await sleep(150);
      return { actions: 6, path: 1 };
    } catch (e) { return { actions: null, error: String(e.message ?? e).slice(0, 90) }; }
  };

  /** Reconnect needs a failing account; with none there is nothing to measure. */
  const fixAccount = async () => {
    await setViewport("desktop");
    await open("/admin/connections");
    const failing = await evaluate(() => /last attempt/i.test(document.querySelector("main")?.innerText ?? ""));
    if (!failing) return { actions: null, na: true };
    let error = "no route to Reconnect";
    for (const [i, path] of [
      [{ c: NEEDS }, { c: /^reconnect/i }, { check: "dialog" }],
      [{ c: NEEDS }, { exists: /^binance|^ibkr|^hyperliquid/i, r: LINK }, { count: 1 }, { goto: "/admin/connections" }, { c: /^reconnect/i }, { check: "dialog" }],
    ].entries()) {
      await open("/admin");
      try {
        let actions = 0;
        for (const s of path) actions += await step(s);
        return { actions, path: i };
      } catch (e) { error = String(e.message ?? e).slice(0, 90); }
    }
    return { actions: null, error };
  };

  const pageMetrics = () => {
    const DEST = { "/admin": /overview/i, "/admin/holdings": /portfolio/i, "/admin/recurring": /recurring/i, "/admin/connections": /accounts|connections/i, "/admin/settings": /settings/i };
    const shown = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none"; };
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
    const words = (t) => t.split(/\s+/).filter(Boolean).length;
    const main = document.querySelector("main");
    const links = [...document.querySelectorAll("header a[href], nav a[href], aside a[href]")].filter(shown);
    const labelled = Object.entries(DEST).filter(([path, name]) => links.some((a) => new URL(a.href).pathname === path && name.test(a.innerText) && inView(a))).length;
    const current = links.some((a) => a.getAttribute("aria-current") === "page" && Object.values(DEST).some((n) => n.test(a.innerText)));
    const add = [...document.querySelectorAll("header a[href], header button, nav a[href], nav button, aside a[href], aside button")].some((el) => shown(el) && /^\+?\s*add\b/i.test(el.innerText.trim()));

    const prose = [...main.querySelectorAll("p, li, [data-slot=alert-description], [data-slot=card-description], [data-slot=item-description], [data-slot=empty-description], [data-slot=field-description]")]
      .filter((el) => shown(el) && !el.closest("table") && !el.querySelector("p, li"));
    const proseWords = prose.reduce((sum, el) => sum + words(el.innerText), 0);
    const longParagraphs = prose.filter((el) => words(el.innerText) >= 25).length;

    const text = main.innerText;
    const JARGON = [/\bflex\b/gi, /\bfifo\b/gi, /\bjev\b/gi, /\bstale\b/gi, /\bHTTP \d{3}\b/g, /\butc\b/gi, /\bcursor\b/gi, /\bnav\b/g, /\bhmac\b/gi, /\bconid\b/gi, /\bprovider\b/gi, /\bsnapshot\b/gi, /\bbackfill\b/gi, /\bquote asset\b/gi, /\bnative (quantit|amount)/gi, /\bunmatched\b/gi, /\bfills?\b/gi];
    const jargonHits = JARGON.reduce((sum, re) => sum + (text.match(re) ?? []).length, 0);
    const rawDates = (text.match(/\b20\d\d-\d\d-\d\d\b/g) ?? []).length;

    const clipped = [...main.querySelectorAll("*")].filter((el) => {
      if (!shown(el) || !el.innerText?.trim() || el.children.length > 3) return false;
      const s = getComputedStyle(el);
      const cuts = s.webkitLineClamp !== "none" || s.textOverflow === "ellipsis";
      return cuts && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    }).length;

    /** A control's real tap area: its box, or the stretched ::after overlay when that's larger. */
    const hitBox = (el) => {
      const box = el.getBoundingClientRect();
      const after = getComputedStyle(el, "::after");
      if (after.content === "none" || after.position !== "absolute") return box;
      return { width: Math.max(box.width, parseFloat(after.width) || 0), height: Math.max(box.height, parseFloat(after.height) || 0) };
    };
    const targets = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=tab], [role=radio], [role=checkbox], [role=switch]")]
      .filter((el) => shown(el) && !el.disabled && !el.closest("p") && el.getAttribute("aria-hidden") !== "true");
    const ok = targets.filter((el) => { const r = hitBox(el); return r.width >= 43.5 && r.height >= 43.5; }).length;

    return {
      labelledDestinations: labelled,
      currentMarked: current,
      addReachable: add,
      proseWords,
      longParagraphs,
      jargonHits,
      rawDates,
      clippedText: clipped,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      tapTargets: targets.length,
      tapTargetsOk: ok,
    };
  };

  /** Scrolls down a long page: a persistent nav is still on screen. */
  const navAfterScroll = () => {
    const DEST = { "/admin": 1, "/admin/holdings": 1, "/admin/recurring": 1, "/admin/connections": 1, "/admin/settings": 1 };
    window.scrollTo(0, document.documentElement.scrollHeight);
    const visible = [...document.querySelectorAll("header a[href], nav a[href], aside a[href]")].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight && DEST[new URL(a.href).pathname] && a.innerText.trim() && getComputedStyle(a).visibility !== "hidden";
    }).length;
    window.scrollTo(0, 0);
    return visible >= 3;
  };

  const measurePages = async (viewport, ids) => {
    await setViewport(viewport);
    const out = {};
    for (const id of ids) {
      await open(PAGE_PATHS[id]);
      out[id] = await evaluate(pageMetrics);
      out[id].navStaysVisible = await evaluate(navAfterScroll);
    }
    return out;
  };

  const recoverySheet = async () => {
    await setViewport("desktop");
    const r = {};
    await open("/admin");
    await page.click((await find(ADD, ["button"])).ref);
    // Let the sheet finish sliding in, as a person would, before typing into it.
    await evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* A looping animation, like a loading skeleton, has no end. */ } }));
    await sleep(400);
    await page.fill((await find(/^amount$/i, FIELD)).ref, "abc");
    r.addAnother = (await controls()).some((c) => /add another/i.test(c.name));
    await page.click((await find(/^add expense$/i, ["button"])).ref);
    for (let i = 0; i < 12 && !(await evaluate(() => Boolean(document.querySelector("[role=dialog] [data-slot=field-error], [role=dialog] [role=alert]")))); i++) await sleep(250);
    Object.assign(r, await evaluate(() => {
      const input = document.querySelector("[role=dialog] input[name=amount]");
      const active = document.activeElement;
      return {
        keepsInput: input?.value === "abc",
        errorInline: Boolean(document.querySelector("[role=dialog] [data-slot=field-error], [role=dialog] [role=alert]")),
        focusInvalid: active === input,
      };
    }));
    await page.clickAt(30, 400);
    await sleep(400);
    r.outsideSafe = await evaluate(() => document.querySelector("[role=dialog][data-state=open] input[name=amount]")?.value === "abc");
    await page.press("Escape");
    await sleep(300);
    r.closeAsks = await evaluate(() => Boolean(document.querySelector("[role=alertdialog]")) && document.querySelector("[role=dialog] input[name=amount]")?.value === "abc");
    return r;
  };

  const recoveryEscape = async () => {
    await setViewport("desktop");
    const r = {};
    await open("/admin");
    await page.click((await find(ADD, ["button"])).ref);
    await find(/^amount$/i, FIELD);
    await page.press("Escape");
    await sleep(300);
    // An occluded browser window produces no frames, so exit animations never report ending. Skip only that wait.
    await evaluate(() => {
      document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* A looping animation, like a loading skeleton, has no end. */ } });
      document.querySelectorAll("[data-state=closed]").forEach((el) => el.dispatchEvent(new AnimationEvent("animationend", { animationName: getComputedStyle(el).animationName })));
    });
    await sleep(300);
    r.escReturns = await evaluate(() => !document.querySelector("[role=dialog][data-state=open]") && /add/i.test(document.activeElement?.innerText ?? ""));
    return r;
  };

  const recoveryAlerts = async () => {
    await setViewport("desktop");
    const r = {};
    await open("/admin");
    await page.click((await find(NEEDS)).ref);
    await find(/^close$/i, ["button"], 3).catch(() => null);
    Object.assign(r, await evaluate(() => {
      const dialog = document.querySelector("[role=dialog]");
      const rows = [...(dialog?.querySelectorAll("[data-slot=item]") ?? [])].filter((row) => /sync failed|out of date|history failed|doesn't seem to be running|not uploaded|missing|expire/i.test(row.innerText));
      return {
        everyAlertHasFix: rows.length > 0 && rows.every((row) => [...row.querySelectorAll("[data-slot=item-actions] button, [data-slot=item-actions] a")].some((c) => c.innerText.trim())),
        reconnectInAlert: [...(dialog?.querySelectorAll("button, a") ?? [])].some((c) => /^reconnect/i.test(c.innerText.trim())),
        dialogCode: /HTTP \d{3}/.test(dialog?.innerText ?? ""),
      };
    }));
    await open("/admin/connections");
    const accounts = await evaluate(() => { const t = document.querySelector("main").innerText; return { failing: /last attempt/i.test(t), code: /HTTP \d{3}/.test(t) }; });
    r.reconnectOffered = accounts.failing ? r.reconnectInAlert : null;
    r.plainErrors = !r.dialogCode && !accounts.code;
    delete r.reconnectInAlert;
    delete r.dialogCode;

    const current = new Date().toISOString().slice(0, 7);
    await open("/admin?month=" + current);
    r.emptyStateActs = await evaluate(() => {
      const empty = document.querySelector("#activity [data-slot=empty]");
      return !empty ? null : [...empty.querySelectorAll("a[href], button")].some((c) => c.innerText.trim());
    });
    return r;
  };

  /** Figures are compared in the page and only true/false comes back: amounts never leave it. One run per part: each is a few full page loads. */
  const figure = () => evaluate(() => (document.querySelector("main").innerText.match(/estimated income[^\n]*\n+\s*([^\n]+)/i) ?? [])[1] ?? null);
  const accountsText = () => evaluate(() => {
    const text = document.querySelector("main").innerText;
    return { failing: /last attempt/i.test(text), oldWords: /check sync|check connection|needs refresh|needs attention|\bstale\b/i.test(text), says: /sync failed/i.test(text) };
  });

  const trustNumbers = async () => {
    await setViewport("desktop");
    const t = {};
    await open("/admin");
    const overviewIncome = await figure();
    const flagged = await evaluate(() => document.querySelector("main").querySelectorAll("svg[aria-label='Needs attention']").length);
    Object.assign(t, await evaluate(() => {
      const text = document.querySelector("main").innerText;
      const figure = (text.match(/net worth[^\n]*\n+\s*([^\n]+)/i) ?? [])[1] ?? "";
      const stale = /out of date or missing/i.test(text);
      return { netWorthDated: /net worth (today|· latest)/i.test(text), netWorthHonest: !stale || !/\.\d\d/.test(figure) };
    }));
    await open("/admin/recurring");
    const recurringIncome = await figure();
    t.incomeAgrees = overviewIncome != null && overviewIncome === recurringIncome;
    await open("/admin/connections");
    const accounts = await accountsText();
    t.failingFlagged = accounts.failing ? flagged > 0 : null;
    return t;
  };

  const trustPortfolio = async () => {
    await setViewport("desktop");
    const t = {};
    await open("/admin/connections");
    const accounts = await accountsText();
    await open("/admin/holdings");
    const holdings = await evaluate(() => {
      const text = document.querySelector("main").innerText;
      return {
        oldWords: /check sync|check connection|needs refresh|\bstale\b/i.test(text),
        says: /sync failed/i.test(text),
        excluded: /not in net worth/i.test(text),
        reconciled: /includes [^\n]+, not in net worth/i.test(text),
        change: /value change|recent value/i.test(text),
        deposits: /includes deposits/i.test(text),
      };
    });
    t.statusWords = !accounts.oldWords && !holdings.oldWords && (!accounts.failing || (accounts.says && holdings.says));
    t.portfolioReconciles = holdings.excluded ? holdings.reconciled : null;
    t.changeHonest = !holdings.change && holdings.deposits;
    return t;
  };

  const trustActions = async () => {
    await setViewport("desktop");
    const t = {};
    await open("/admin");
    await page.click((await find(ADD, ["button"])).ref);
    await find(/^amount$/i, FIELD);
    t.addStartsClean = await evaluate(() => !/^(ibkr|binance|hyperliquid|wise|maribank)$/i.test(document.querySelector("[role=dialog] input[name=account]")?.value ?? ""));

    // Filters switch on the client, so the walk stays on one page load.
    await open("/admin");
    const view = () => evaluate(() => ({
      tab: document.querySelector("#activity [role=radio][data-state=on]")?.innerText,
      count: document.querySelector("#activity [role=status]")?.innerText,
    }));
    const before = await view();
    await page.click((await find(/^show activity for/i)).ref);
    await sleep(300);
    await page.click((await find(/^show all categories|^show activity for/i)).ref);
    await sleep(300);
    const after = await view();
    t.filterClears = before.tab === after.tab && before.count === after.count;
    return t;
  };

  const trustMonths = async () => {
    await setViewport("desktop");
    const t = {};
    await open("/admin");
    const opening = ((await page.info()).url.match(/month=(\d{4}-\d{2})/) ?? [])[1] ?? null;
    await open("/admin/earnings");
    const byMonth = await evaluate(() => ([...document.querySelectorAll("main a[href]")].find((a) => /by month/i.test(a.innerText))?.getAttribute("href").match(/month=(\d{4}-\d{2})/) ?? [])[1] ?? null);
    t.earningsSameMonth = opening == null || byMonth === opening;
    t.ratesClear = await evaluate(() => { const text = document.querySelector("main").innerText; return !/today's rate/i.test(text) || /estimate/i.test(text); });
    await open("/admin/recurring");
    t.fixedCostsHonest = await evaluate(() => !/fixed costs[^\n]*\n+\s*.?0\.00/i.test(document.querySelector("main").innerText));
    return t;
  };

  /** A true 1440x900 (the browser may be zoomed), on the opening month: do the side panels need scrolling? */
  const trustFit = async () => {
    const size = (w, h) => page.cdp("Emulation.setDeviceMetricsOverride", JSON.stringify({ width: Math.round(w), height: Math.round(h), deviceScaleFactor: 1, mobile: false }));
    await size(1440, 900);
    const scale = 1440 / (await evaluate(() => innerWidth));
    await size(1440 * scale, 900 * scale);
    await open("/admin");
    const hidden = await evaluate(() => [...document.querySelectorAll("main [data-slot=scroll-area-viewport]")]
      .filter((v) => !v.closest("#activity"))
      .map((v) => Math.max(0, v.scrollHeight - v.clientHeight)));
    await setViewport("desktop");
    return { panelsShowAll: hidden.length >= 2 && hidden.every((px) => px <= 1), panelOverflowPx: hidden };
  };

  const guards = async () => {
    await setViewport("desktop");
    const current = new Date().toISOString().slice(0, 7);
    await open("/admin");
    const onOpening = await evaluate(() => {
      const label = document.querySelector("main h1")?.innerText.split("·").pop().trim() ?? "";
      const shown = (document.querySelector("header")?.innerText ?? "").toUpperCase().includes(label.toUpperCase().split(" ")[0]);
      const body = document.body.innerText;
      return { label, shown, notice: /latest month with|nothing (recorded|yet) (for|in) |has no records/i.test(body) };
    });
    const opening = parseLabel(onOpening.label);
    const isCurrent = opening.year + "-" + String(opening.month + 1).padStart(2, "0") === current;

    await page.click((await find(/^hide amounts$/i)).ref);
    await sleep(350);
    const privacy = await evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let total = 0, blurred = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!/[₱$€£]\s?\d/.test(node.textContent) || node.parentElement.closest("script, style")) continue;
        const r = node.parentElement.getBoundingClientRect();
        // Off-page text is the chart library's measuring span, not an amount anyone can see.
        if (r.width <= 1 || r.height <= 1 || r.bottom + scrollY < 0) continue;
        total++;
        for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) if (getComputedStyle(el).filter.includes("blur")) { blurred++; break; }
      }
      return { total, blurred };
    });
    await page.click((await find(/^show amounts$/i)).ref);

    await open("/admin?month=" + current);
    const unknownNotZero = await evaluate(() => {
      const text = document.querySelector("main").innerText;
      return !(/statements missing/i.test(document.body.innerText) && /(^|\n)(spent|earned|income)[^\n]*\n+\s*.?0\.00\b/i.test(text));
    });
    return { monthVisible: onOpening.shown, monthExplained: isCurrent || onOpening.notice, privacyTotal: privacy.total, privacyBlurred: privacy.blurred, unknownNotZero };
  };

  /** Click to the new page's heading, timed inside the page so the automation's own delay doesn't count. */
  const speed = async () => {
    await setViewport("desktop");
    await open("/admin");
    const times = [];
    for (const name of [/^portfolio\b/i, /^settings$/i, /^recurring\b/i, /^overview\b/i]) {
      await evaluate(() => {
        const heading = () => document.querySelector("main h1")?.innerText;
        const from = location.pathname, before = heading();
        window.__navTiming = { t0: null, ms: null };
        addEventListener("click", () => { window.__navTiming.t0 = performance.now(); }, { capture: true, once: true });
        const observer = new MutationObserver(() => {
          const t = window.__navTiming;
          if (t.t0 != null && t.ms == null && location.pathname !== from && heading() && heading() !== before) { t.ms = performance.now() - t.t0; observer.disconnect(); }
        });
        observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
      });
      await page.click((await find(name, LINK)).ref);
      for (let i = 0; i < 40; i++) {
        const ms = await evaluate(() => window.__navTiming?.ms);
        if (ms != null) { times.push(Math.round(ms)); break; }
        await sleep(200);
      }
    }
    return times;
  };

  const build = async () => {
    await open("/admin");
    return evaluate((id) => ({
      production: !document.querySelector("nextjs-portal"),
      buildConfirmed: id ? document.documentElement.outerHTML.includes(id) : false,
    }), inputs.buildId ?? "");
  };

  switch (inputs.section) {
    case "build": return build();
    case "tasks": {
      const out = {};
      for (const id of inputs.ids) {
        if (id === "jump-month") out[id] = await jumpMonth();
        else if (id === "fix-account") out[id] = await fixAccount();
        else out[id] = await runTask(id, TASKS[id]);
      }
      return out;
    }
    case "pages": return measurePages(inputs.viewport, inputs.ids);
    case "recovery-sheet": return recoverySheet();
    case "recovery-escape": return recoveryEscape();
    case "recovery-alerts": return recoveryAlerts();
    case "guards": return guards();
    case "trust-numbers": return trustNumbers();
    case "trust-portfolio": return trustPortfolio();
    case "trust-actions": return trustActions();
    case "trust-months": return trustMonths();
    case "trust-fit": return trustFit();
    case "speed": return speed();
    case "reset": await setViewport(null); return "reset";
    default: throw new Error("unknown section " + inputs.section);
  }
});
