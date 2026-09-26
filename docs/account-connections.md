# Private account connections

Open **Settings → Manage connections** (`/admin/connections`). Connections are protected by
the existing admin login. **Holdings** (`/admin/holdings`) displays saved Binance and IBKR
positions alongside manual holdings, with asset-class filters covering both. Use **Sync accounts**
or an account's **Sync now** to update connected quantities and values; **Refresh prices** updates
manual holding quotes and exchange rates. Provider positions are displayed directly from the saved
snapshot and are never copied into manual holdings.

Positions remain visible when excluded from net worth or when automatic sync is paused. The
Holdings totals use the same inclusion settings as the overview. Matching manual platform/symbol
entries are flagged for review so the same assets are not inadvertently counted twice. Unknown
provider prices, cost bases and P/L remain explicitly unknown. Archived views show archived manual
holdings only; current connected positions belong in the active view.

Active Holdings hides positions with a known total value below **US$1** by default, converting
other currencies through the saved PHP FX rates. **Show small balances** reveals them and is
preserved while changing asset-class filters. This is a display filter: totals and saved balances
always retain small positions. Unpriced positions and positions with missing conversion rates
remain visible, and archived manual holdings are not subject to the minimum.

## First setup

1. Run `bun run db:migrate` against the intended database before deploying this version.
   Migrations `0004` through `0006` add connections, imported activity, category rules,
   notification dismissals, Wise statement dates and investment history progress. Existing holdings remain intact.
2. Keep `ADMIN_SESSION_SECRET` stable. Account credentials use AES-256-GCM with a key derived
   from that secret. Rotating it requires reconnecting accounts; existing saved balances remain.
3. Connect each supported account using the private form. Tokens are stored encrypted and
   are never returned by the DAL or JSON backup. Do not paste tokens into chat or commit them.
4. After a successful sync, review the positions, archive any matching manual holdings, then
   select **Include in net worth**. New connections start excluded to avoid double counting.

One connection per provider is supported. Reconnecting replaces its credentials, clears its
previous balance snapshot, and requires reviewing inclusion again.

## Binance Spot and Simple Earn

Create a system-generated HMAC key in Binance API Management. Enable Reading, and disable
trading, transfers, margin, futures, options and withdrawals. The connection checks the key's
permissions before reading balances. If the key uses IP restrictions, allow the hosting
server's egress IP; do not enable trading permissions to work around an access error.

The sync retrieves Spot free + locked balances, all pages of Simple Earn Flexible positions,
and all pages of Simple Earn Locked positions (up to 1,000 per product type). A failure or
incomplete page in any wallet rejects the whole snapshot and retains the previous one.

The Spot API can also expose Earn receipts such as LDBTC and LDSOL. These are omitted when
they are unpriced and the same snapshot contains underlying BTC/SOL Earn positions covering
their quantities. Earn's reported total (including accrued rewards) is used once. This also
applies when reading older saved snapshots. Priced tokens, unmatched receipts and excess
receipt quantities remain visible; the code never discards assets based on an LD prefix alone.
See [Binance support's explanation](https://www.reddit.com/r/binance/comments/1ppvtg9/api_spot_balance_excluding_earn_ld_tokens_bot/).

Values are estimates using Binance USDT pairs (or BTC cross rates) and CoinGecko's USDT/USD
quote. Unsupported price pairs remain unvalued, with an explicit warning. Cost basis is
unknown; these balances do not create a fabricated profit or loss. Locked Earn uses the
reported principal amount; cumulative rewards are not added again. Rewards and redemptions
in transit may not yet be reflected. Funding, Margin, Futures, other Earn products and staking
services are outside this connection's scope.

References: [Spot account](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/account),
[Simple Earn](https://developers.binance.com/en/docs/catalog/investment-and-services-simple-earn/api/rest-api/flexible-locked),
[key permissions](https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/account).

## Interactive Brokers

In IBKR Client Portal, enable Flex Web Service and generate a token. Create an **Activity Flex
Query**, using **XML**, **Last Business Day**, and **yyyyMMdd** dates. Select:

- Open Positions at **Summary** level, with Conid, Symbol, Description, Currency, Asset Category,
  Quantity, Position Value, Cost Basis Money, and Level of Detail.
- Cash Report, with Currency and Ending Cash, including each currency's rows.

Enter the Flex token and query ID in the dashboard. Tokens can expire; reconnect with a new
token when needed. The server requests a report, then retrieves it with bounded retries.

For automatic transactions and earnings, create a **second Activity Flex Query**, XML with
**Last 30 Calendar Days** and **yyyyMMdd** dates. Enter its ID in **History Activity Flex Query ID**:

- Cash Transactions: include all fields, particularly Transaction ID, Report Date, Currency,
  Amount, Type and Description.
- Trades: **Executions only**, with Trade ID, Trade Date, Symbol, Currency, Buy/Sell, Proceeds,
  Realized PNL, IB Commission, IB Commission Currency and Level of Detail.

Empty included sections are valid; missing sections, blank numeric fields and summary/lot
trade rows fail the history import. History errors are separate from successfully updated balances.
Realized P/L follows IBKR's reported value, which already includes trade commissions.
Cash transaction types that aren't recognized are filed by AI like any other entry.

IBKR values reflect the statement date, not live quotes. The parser uses reported position
values (so option contract multipliers are respected), preserves short positions and negative
cash, and excludes the duplicate BASE_SUMMARY cash row. Multiple periods for one account,
lot-level positions, missing sections and malformed data reject the snapshot.

The balance total includes open positions and cash, not every broker NAV adjustment such as
accrued interest. ETF classification follows the asset category supplied in the report; an
ETF reported as STK appears as stock.

Reference: [IBKR Flex Web Service](https://www.interactivebrokers.com/docs/web-api/flex-web-service/using-flex-web-service).

## Wise

Wise does not sync. Personal Wise API tokens cannot read statements (Wise documents statement access
for personal tokens only in a few countries, and no longer accepts signed SCA requests from personal
accounts), so the API connection was removed and its saved token deleted (migration
`0011_drop_wise_connection`). The Wise card on Connections imports balance statement CSVs instead;
see below. Wise balances are not part of net worth.

## CSV imports and category rules

**Import Wise CSVs** (Wise card on `/admin/connections`) supports Wise English **balance statement** CSVs, not the transfer-list export. Wise exports one
statement per currency: pick them all in the file picker, or drag them onto the button (up to 10 files,
2.5 MB in total). There is no preview step: the files import, then rules and AI file them, in one action.
A conversion appears in both currencies' files and is kept once per leg; the latest closing balance per
currency wins, and two files disagreeing on the same date apply neither.
Required columns are TransferWise ID (or Wise ID / Transaction ID / ID), Date, Amount, Currency,
and Description. Comma/semicolon delimiters, UTF-8 BOMs, quoted fields and embedded newlines are
accepted. Dates use DD-MM-YYYY, DD/MM/YYYY or ISO; amounts use decimal points. Limits per file: 750 KB,
2,000 source rows. Download instructions: [Wise statements](https://wise.com/help/articles/2736049/how-do-i-download-a-statement).

Rows are classified by Wise's **Transaction Details Type** column when the export has it, else by ID
prefix and description. Money received from someone else (`DEPOSIT`, incoming `TRANSFER`, or a
"Received money from …" description) is a **payment**, so rules and AI can post it as income such as
Salary or Freelance. Conversions, cross-balance moves, top-ups (`MONEY_ADDED`) and outgoing transfers
stay transfers; `ACCRUAL_CHARGE` and `FEE-` rows are fees; balance interest is interest.

The fee convention is detected per file: a file with its own `FEE-` rows is an accounting export and
its amounts are kept as-is; otherwise amounts include **Total fees**, and the import splits each gross
principal and fee while preserving the original signed total. All files import atomically: a conflict
with a previous import (same ID, different amount or date) rejects the whole batch and changes nothing.
CSV data is never evaluated as spreadsheet formulas, and uploaded files are not retained.

Closing balances in **Running Balance** are checked for a consistent order but not saved: statements
import transactions only.

Source identity is provider + account + external transaction ID. Wise adds currency and direction
to distinguish conversion legs and reversals. Binance uses the account UID and provider history
identifiers; Earn has no event ID, so it uses product/position, asset, reward type and timestamp.
Conflicting amounts for an existing identity reject the entire import instead of rewriting reviews.
Repeated imports preserve category choices, ignored records and posted/deleted entries.

Rules live in **Settings → Category rules**. They match description text (case-insensitive),
income/expense direction and optional provider, and post automatically using PHP FX at posting time.
The longest matching text wins; equally specific conflicting rules leave the entry to AI. Rules saved
before posting became automatic ("Left to AI") no longer hold entries back. Up to 500 eligible entries
are processed per pass; larger backlogs continue with the next import or sync. Unknown transaction
types, transfer principal, trades and Binance crypto units never match a rule. Posted entries use the
import UUID as their cash-flow UUID and are changed/deleted/undone in Transactions.

## AI categorization

With `AI_GATEWAY_API_KEY` set (Vercel AI Gateway; model `AI_CATEGORIZE_MODEL`, default
`anthropic/claude-haiku-4.5`), whatever rules leave pending is categorized by AI during every sync,
Wise CSV import and IBKR report import, before the action returns, so the result message and the
refreshed pages already show where each entry went. The daily cron runs it too. There is no review
queue: the model's answer is final. Without the key, only rules run and new activity stays uncategorized.

Set `AI_CATEGORIZE_MODEL=typesafe-ai/jev` to classify with TypeSafe AI's Jev evaluation model instead.
Jev answers one native choice question per entry. The options are exactly the decisions that entry
allows, named in words (`post:expense:Subscriptions`), each with a one-line description of what belongs
there. The question also names the account holder, so a payment to that person is a transfer between
their own accounts. Jev files a category on its own when that choice is at least 80% likely and at least
20 points ahead of the next option. A closer category pick is posted to Other, and the reason keeps the
guess, e.g. `Jev: Other, closest Business (62% likely)`. Language models answer batches of 100 in one
prompt. Some lines are decided without a model: crypto rewards and fees, Wise activity in a currency the
budget cannot convert, Wise card checks of 1.00, payments to the account holder, Binance and IBKR
deposits and withdrawals, and budget-currency dividends, interest, fees and tax (Investment income, Fees
& charges, and Taxes).

Each entry gets one decision, validated server-side against what posting and the ledger accept:

- **post**: fiat Wise/IBKR income or expense goes to Transactions under a category whose kind
  matches the amount's sign. If the same date, currency, amount and direction is already in
  Transactions (a recurring or manual entry), the import is ignored as `Already in Transactions`.
- **transfer**: principal moving between your own accounts (payment/transfer/other types only).
- **investment**: IBKR/Binance activity kept in the earnings ledger (status `reviewed`).
- **ignore**: noise such as holds or reversals.

Before the model runs, unambiguous transfer pairs (same currency, exact opposite amounts, within
seven days, different accounts) are linked. Binance and IBKR deposits and withdrawals are filed as
transfers even when no partner entry is in the import.

Each entry is claimed before the model call (`ai_attempted_at`), so overlapping sync/import/cron runs
never pay twice for the same row. A failed call releases its claim for the next run. Invalid answers and
posts without a PHP exchange rate stay pending and are asked again on the first run an hour or more later.
One sync or import categorizes up to 1,200 entries within about 2.5 minutes; the rest continue on the next
sync or the daily cron. If entries wait more than a day while a key is set, a notification points at the
key or credits. The model receives the account holder's name, the provider, type, date, signed amount,
currency and description of each entry, the active categories with a one-line description of each, and up to 80 of your own
past decisions (posts, transfers, ignores) as examples. Descriptions are treated as data, never as instructions. Account IDs, source IDs, credentials and balances are never sent.
Posted rows carry the reason in their notes (`Categorized by AI: …`). To correct one, edit its category
in Transactions; that correction teaches later runs.

## Transfers and investment earnings

Automatic linking requires opposite amounts in the same currency, within seven days, with an unambiguous
candidate in another account. Other movements between your own accounts are filed as unlinked transfers by AI.
Transfer principal stays out of income, expenses and budgets; fee entries remain separate. Ignoring an entry
also excludes it from earnings, while keeping it in investment history does not.

Binance imports **30 completed UTC days** of Flexible (ALL reward types) and Locked rewards, plus
completed crypto deposits and withdrawals. Each collection is fully paginated within bounded limits;
partial/changing pages fail without importing a partial history. Configure Spot trade history separately
below. Fiat/P2P purchases, internal wallet transfers, and other Earn products are excluded. Native reward quantities
are kept; no historical fiat price or cost basis is invented. Withdrawal amount and fee are retained
as separate reported fields; no exchange-rate or net-received amount is inferred.

`/admin/earnings` shows monthly or all-time native-currency contributions, rewards, dividends, interest, reported
realized P/L, fees and taxes. Transfers into/out of investment accounts form net contributions;
matched transfers between Binance/IBKR accounts are excluded. Wise activity is outside this investment
summary. Fees shown beside IBKR realized P/L must not be subtracted again from that P/L. Current
unrealized P/L is a separate snapshot of positions with known values and cost basis. History coverage
is shown explicitly; older activity is loaded from Investment history.

## Older investment history

Open **Investment history** (`/admin/history`). This is an archive of imported records, not an
assertion that every historical product or date is present. First/last record dates and individual
IBKR report ranges are displayed separately from the latest automatic sync window.

- **Binance history:** connect a read-only key, enter the first date for Earn/crypto transfers,
  and list every Spot pair traded (including assets already sold). The API requires a symbol and
  cannot enumerate the user's historical pairs. Each pair starts at `fromId=0`, pages by trade ID,
  saves a durable cursor, and continues new trades from that cursor. Earn/deposits/withdrawals use
  30-day UTC windows, preserving the same IDs as rolling sync. **Continue all** advances batches
  until caught up; Stop finishes the current atomic batch. Pausing/reconnecting invalidates in-flight
  writes. Daily cron advances configured streams with bounded concurrency and a time budget.
- **IBKR history:** export Activity Flex XML for each older period, using Cash Transactions and
  execution-level Trades with the same fields as the automatic query. No 30-day application limit;
  files are bounded to 2.5 MB and 25,000 normalized entries. Split larger files by date. All accounts
  in one report must use the same range. Preview shows duplicate/conflict counts and confirms the
  actual report period. File hashes/ranges and source records commit atomically. Overlap with live
  sync is deduplicated by account and transaction/trade ID, retaining review decisions.

Spot fills retain quantity, quote amount, price, side, time, market and native commissions. The
separate FIFO estimate uses purchases within the same account/pair, includes base/quote fees,
flags commissions in a third asset and unmatched sells, and never assumes missing buys cost zero.
It is not a cross-market cost-basis or tax calculation: rewards, transfers, Convert and acquisitions
in other pairs are outside it. It does not alter current holdings or reported IBKR realized P/L.
Provider retention, delisted markets, missing pairs and unsupported products can leave gaps; a stream
marked Caught up means the API returned its available records, not certified lifetime completeness.

On **Investment history → Import Spot costs**, the app discovers up to 20 currently listed USDT
markets for held coins, starting with the largest balances. It imports each market from its earliest
available fill and saves the cursor for daily updates. Add any other traded pairs in Investment
history, including delisted or already-sold assets where supported. Public `exchangeInfo` requests
carry only the symbol, without signed-request parameters that Binance rejects on that endpoint.

Selecting a coin on Holdings shows its estimated P/L, average remaining purchase cost and
the quantity represented by those lots. Costs stay in their actual quote asset (USDT is not USD).
One report covers the coin across Spot and Simple Earn, with no duplicate cost assignment between
wallets. Snapshots retain the Binance UID so costs never borrow records from an earlier connection.
Missing/mismatched units, rewards/transfers, unmatched sells, other pairs, external-coin fees,
ignored fills, unfinished imports and stale trade history remain recorded as gaps. A matching
quantity alone is not proof of a complete acquisition history. The Holdings page displays an
explicit **estimated P/L** for a coin with one supported USDT cost pool. Its average remaining
purchase cost is applied to the lesser of the current balance and recorded remaining units.
This proportionally reduces cost after movements out of the account and excludes unmatched
extra units from profit. It does not establish which lots were transferred, and does not invent
zero-cost acquisitions. Snapshot USDT/USD rates (or the same snapshot's USDT balance valuation
for legacy snapshots) convert that quote-currency P/L, then current FX presents it in PHP.

Holdings' estimated P/L and tracked cost summaries include these estimates for accounts included
in totals, even when small rows are hidden. Provider-reported `costBasis` remains unchanged;
these estimates do not rewrite the source ledger or replace the overview's reported-cost figures.
**Refresh** updates balances, manual prices and one batch of each enabled configured Spot stream;
paused streams stay paused, and larger backlogs continue from Investment history or daily sync.
Spot and Earn wallets are grouped into one row per coin. Setup, import controls and provider
warnings live on Connections and Investment history instead of the primary holdings table.

References: [Binance account trade list](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/account#my-trades),
[Binance Earn history](https://developers.binance.com/en/docs/catalog/investment-and-services-simple-earn/api/rest-api/flexible-locked#get-flexible-rewards-history),
[IBKR Flex queries](https://www.interactivebrokers.com/docs/web-api/flex-web-service/client-portal-configuration/create-a-flex-query).

References: [Binance reward history](https://developers.binance.com/en/docs/catalog/investment-and-services-simple-earn/api/rest-api/flexible-locked),
[Binance deposits/withdrawals](https://developers.binance.com/en/docs/catalog/core-trading-wallet/api/rest-api/capital),
[IBKR cash transactions](https://www.ibkrguides.com/reportingreference/reportguide/cash%20transactionsfq.htm),
[IBKR trade P/L](https://www.ibkrguides.com/reportingreference/reportguide/tradesfq.htm).

## Private notifications

The dashboard bell and `/admin/notifications` derive current alerts when the page is opened:
failed/stale balance syncs, failed history imports, credential expiry within 7 days (a date supplied
by the user), recurring bills within 3 days or overdue, debt due dates within 3 days, and expense
budgets at 85%/100%. The expiry reminder can be edited without re-entering credentials.
Budget totals include posted transactions only. A recorded debt payment in the due month suppresses
that debt's upcoming reminder; confirm payment adequacy with the lender's statement.

Dismissals persist per event, month or sync episode. Conditions that resolve disappear; a new billing
period, budget threshold or failure after a successful sync can alert again. Delivery is in-app only,
without email, push messages or extra permissions. Imported activity, rules and dismissals are included
in the private JSON backup; credentials remain excluded.

## Scheduling and recovery

The existing Vercel job runs `/api/cron/daily` at `0 22 * * *` UTC (6 AM Manila). Set
`CRON_SECRET` on the production deployment. Local `next dev` / `next start` and preview
deployments do not run the Vercel schedule; **Sync now** works on demand.

The job syncs enabled accounts and advances investment history before FX/prices and net-worth snapshots.
The route allows up to 300 seconds; configure hosting with a compatible duration limit. Each provider has an
atomic database lease and a one-minute cooldown. A failed request preserves its last successful
snapshot and records a safe error. Stale dates and missing valuations are visible on the page.
Pausing automatic sync retains saved balances and the inclusion setting. Disconnecting removes
credentials and current balances; it does not delete historical net-worth snapshots or revoke
the provider's token. Imported transaction history and its review decisions are also retained.

The account clients only make GET requests to fixed provider hosts, refuse redirects, enforce
timeouts and response-size limits, and never log request URLs or raw provider errors. IBKR's
token-in-query API uses Node HTTPS directly to avoid Next's fetch URL instrumentation.

## Verification

Run `bun test`, `bun run lint`, `bun run typecheck`, and `bun run build`. Provider tests use
synthetic account data and injected transports, never real financial credentials. Live account
compatibility is confirmed by the first successful sync after entering real credentials.

The optional database integration test creates isolated synthetic records and removes them in a
`finally` block. Run it only against a development database:

```powershell
$env:FINANCE_DB_TESTS = '1'
bun --env-file=.env.local test lib/finance/imports/database.test.ts
```

It checks atomic conflicting imports, concurrent deduplication, concurrent posting/rule application,
Wise balance concurrency/rollback, and that re-importing a deleted posted entry never creates it again.
