# Admin usability cold test

The measured score can saturate while the app still confuses people, so `bun run ux:score` caps the result at
this test's rating. Run it after the measurement, on the same source, with someone who has never seen the
admin: a person is best, a fresh agent with no project context is next best. Use the same wording each time,
and record the rating you get: rerunning until a tester says 9 would make the number meaningless.

Record the result in `admin-usability.cold-test.json`, with `sourceHash` from `bun scripts/admin-usability.ts --hash`.

## Rules for the tester

This is live personal financial data, so it is read only. Never press Sync, Save, Save & sync, Add expense,
Add another, Delete, Disconnect, Dismiss, Pause, Resume, Post, Import, Export, Set up import, Fetch new trades
or any checkbox. Opening a form to look at it is fine; submitting isn't. Keep amounts out of the report.

Rate what is actually there, neither flattering nor manufacturing complaints. Don't mark it down for honest
"no data yet" states or for the owner's real data being strange: rate the app, not their finances.

## Tasks

Start each from `/admin`. Note clicks, what you tried first, and any moment you hesitated.

1. What did I spend and earn in the month shown? Which month is it, and why that month?
2. Go to the Recurring page.
3. Find where to manage connected accounts. Read why one is failing and what to do about it.
4. Open the form to fix that failing account (open only; close without submitting).
5. Jump to the month six months back.
6. Filter the activity to one category, then clear the filter. Is everything back how it was?
7. Open the Add form from any page, type an amount, click outside it. Did your typing survive? Then press the X and discard.
8. Find what I earned from investments, then the investment history, then search that history for a word.
9. Hide all amounts, confirm they are hidden, show them again.
10. On two pages other than the Overview, is it obvious where you are and how to get elsewhere?

Then look at every main page once: Overview, Portfolio with its Earnings and History views, Recurring, Accounts, Settings.

## Report

- A table: task, clicks, success, friction.
- A single rating out of 10. 9 means a first-time user finds everything quickly and trusts what they read, with only minor polish left.
- A second rating: what it would be with the owner's data fresh (accounts reconnected, statements uploaded, fixed costs added).
- The remaining problems, most important first, each marked "real problem" or "minor polish", and whether fresh data would remove it or it's the app's own design.
- Anything misleading about the money figures.
