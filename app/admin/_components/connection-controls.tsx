"use client";

import { useState, useTransition } from "react";
import { Link2, RefreshCw, Unplug } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PROVIDER_META, type Provider, type WiseProfileLookup } from "@/lib/finance/connections/types";
import type { FormState } from "@/lib/finance/schemas";
import { disconnectAccount, findWiseProfiles, saveConnection, saveConnectionExpiry, syncConnections, updateConnection } from "../_actions/connections";
import { FormField, FormFooter, FormSheet, notify, useFormAction } from "./form";

function ConnectionForm({ provider }: { provider: Provider }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveConnection);
  const [lookingUp, startLookup] = useTransition();
  const [wiseToken, setWiseToken] = useState("");
  const [wiseProfileId, setWiseProfileId] = useState("");
  const [lookup, setLookup] = useState<WiseProfileLookup | null>(null);
  const wiseProfiles = lookup?.ok ? lookup.profiles : [];
  const busy = pending || lookingUp;
  const findProfile = () => startLookup(async () => {
    setLookup(null);
    setWiseProfileId("");
    const data = new FormData();
    data.set("token", wiseToken);
    try {
      const result = await findWiseProfiles(data);
      setLookup(result);
      if (result.ok && result.profiles.length === 1) setWiseProfileId(result.profiles[0].id);
    } catch {
      setLookup({ ok: false, message: "Profile lookup failed. Check your connection and try again." });
    }
  });
  const name = PROVIDER_META[provider].name;
  const fields = provider === "binance"
    ? [{ key: "apiKey", label: "API key", secret: true }, { key: "apiSecret", label: "Secret key", secret: true }]
    : [{ key: "token", label: provider === "ibkr" ? "Flex Web Service token" : "API token", secret: true },
      { key: provider === "ibkr" ? "queryId" : "profileId", label: provider === "ibkr" ? "Activity Flex Query ID" : "Wise profile ID", secret: false }];
  return (
    <form key={formKey} onSubmit={(event) => { if (busy) event.preventDefault(); else onSubmit(event); }} className="flex flex-col gap-6">
      <input type="hidden" name="provider" value={provider} />
      {provider === "wise" ? (
        <Alert>
          <AlertTitle>Connect with your Wise API token</AlertTitle>
          <AlertDescription>
            Enter your existing token, then find the profile it can access. Balance syncing depends on your token&apos;s permissions.
          </AlertDescription>
        </Alert>
      ) : provider === "binance" ? (
        <p className="text-sm text-muted-foreground">
          Create a system-generated HMAC API key with Enable Reading only. Disable trading, transfers and withdrawals.
          Spot and Simple Earn Flexible/Locked are included; other wallets and Earn products are outside this connection.
        </p>
      ) : (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>In IBKR, enable Flex Web Service and create an Activity Flex Query:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Choose XML, Last Business Day, and date format yyyyMMdd.</li>
            <li>Include Open Positions at Summary level: Conid, Symbol, Description, Currency, Asset Category, Quantity, Position Value, Cost Basis Money, and Level of Detail.</li>
            <li>Include Cash Report with Currency and Ending Cash, including rows for each currency.</li>
            <li>For history, create a second XML Activity Flex Query covering Last 30 Calendar Days, with yyyyMMdd dates.</li>
            <li>Include Cash Transactions with all fields, including Transaction ID, Report Date, Currency, Amount, Type and Description.</li>
            <li>Include Trades at Executions level only: Trade ID, Trade Date, Symbol, Currency, Buy/Sell, Proceeds, Realized PNL, IB Commission, IB Commission Currency and Level of Detail.</li>
          </ol>
          <p>Reports update after the trading day. Keep the token expiry date in mind.</p>
        </div>
      )}
      <Button asChild variant="link" className="self-start">
        <a href={PROVIDER_META[provider].docs} target="_blank" rel="noopener noreferrer">{name} setup guide</a>
      </Button>
      <FieldGroup>
        {provider === "wise" ? <>
          <FormField id="wise-token" label="API token" error={error("token")}>
            <Input id="wise-token" name="token" type="password" autoComplete="off" spellCheck={false}
              maxLength={4096} required disabled={busy} aria-invalid={Boolean(error("token"))}
              value={wiseToken} onChange={(event) => {
                setWiseToken(event.target.value);
                setWiseProfileId("");
                setLookup(null);
              }} />
          </FormField>
          <FormField id="wise-profileId" label="Wise profile ID" error={error("profileId")}
            description="Find the ID using your token, or enter it if you already know it.">
            {wiseProfiles.length > 1 ? (
              <Select name="profileId" value={wiseProfileId} onValueChange={setWiseProfileId} required disabled={busy}>
                <SelectTrigger id="wise-profileId" className="w-full" aria-invalid={Boolean(error("profileId"))}>
                  <SelectValue placeholder="Choose a profile" />
                </SelectTrigger>
                <SelectContent>
                  {wiseProfiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>
                    {profile.type === "PERSONAL" ? "Personal" : "Business"} · {profile.id}
                  </SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input id="wise-profileId" name="profileId" inputMode="numeric" autoComplete="off" spellCheck={false}
                maxLength={30} required disabled={busy} aria-invalid={Boolean(error("profileId"))}
                value={wiseProfileId} onChange={(event) => setWiseProfileId(event.target.value)} />
            )}
            <Button type="button" variant="outline" className="self-start" onClick={findProfile} disabled={busy || !wiseToken.trim()}>
              {lookingUp && <Spinner />}{lookingUp ? "Finding profile…" : "Find my profile"}
            </Button>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{lookup?.message}</p>
          </FormField>
        </> : fields.map((field) => (
          <FormField key={field.key} id={`${provider}-${field.key}`} label={field.label} error={error(field.key)}>
            <Input id={`${provider}-${field.key}`} name={field.key} type={field.secret ? "password" : "text"}
              inputMode={field.secret ? "text" : "numeric"} autoComplete="off" spellCheck={false}
              maxLength={field.secret ? 4096 : 30} required aria-invalid={Boolean(error(field.key))} disabled={pending} />
          </FormField>
        ))}
        {provider === "ibkr" && <FormField id="ibkr-history-query" label="History Activity Flex Query ID (optional)" description="Use the separate 30-day query to import dividends, cash movements and trade results.">
          <Input id="ibkr-history-query" name="historyQueryId" inputMode="numeric" maxLength={30} autoComplete="off" disabled={pending} />
        </FormField>}
        <FormField id={`${provider}-expires`} label="Credential expiry date (optional)" description="Saved reminders appear 7 days before this date. The provider does not supply this date automatically.">
          <DatePicker id={`${provider}-expires`} name="credentialsExpireOn" disabled={busy} />
        </FormField>
      </FieldGroup>
      <p className="text-sm text-muted-foreground">Credentials are encrypted on the server. This connection only reads your account.</p>
      <FormFooter state={state} pending={busy}>{pending ? "Connecting…" : lookingUp ? "Finding profile…" : "Save & sync"}</FormFooter>
    </form>
  );
}

export function CredentialExpiryButton({ provider, expiresOn }: { provider: Provider; expiresOn: string | null }) {
  return <FormSheet title="Credential expiry reminder" description="Update the reminder without replacing your API credentials."
    trigger={<Button variant="outline" size="sm">Expiry reminder</Button>}><CredentialExpiryForm provider={provider} expiresOn={expiresOn} /></FormSheet>;
}
function CredentialExpiryForm({ provider, expiresOn }: { provider: Provider; expiresOn: string | null }) {
  const { state, pending, onSubmit } = useFormAction(saveConnectionExpiry);
  const [date, setDate] = useState(expiresOn ?? "");
  return <form onSubmit={onSubmit} className="flex flex-col gap-6"><input type="hidden" name="provider" value={provider} />
    <FormField id="credential-expiry" label="Expiry date"><DatePicker id="credential-expiry" name="credentialsExpireOn" value={date} onValueChange={setDate} disabled={pending} /></FormField>
    <Button type="button" variant="ghost" onClick={() => setDate("")} disabled={pending}>Clear reminder</Button>
    <FormFooter state={state} pending={pending}>Save reminder</FormFooter>
  </form>;
}

export function ConnectAccountButton({ provider, connected = false }: { provider: Provider; connected?: boolean }) {
  return (
    <FormSheet title={`${connected ? "Reconnect" : "Connect"} ${PROVIDER_META[provider].name}`}
      description={connected ? "Replacing credentials clears the old synced balances until the new connection succeeds." : "A one-time setup for automatic balance updates."}
      trigger={<Button variant="outline" size="sm"><Link2 />{connected ? "Reconnect" : "Connect"}</Button>}>
      <ConnectionForm provider={provider} />
    </FormSheet>
  );
}

export function SyncConnectionsButton({ provider, disabled = false }: { provider?: Provider; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const run = () => startTransition(async () => {
    try {
      const result = await syncConnections(provider);
      notify(result);
      setMessage(result.ok ? "Sync complete." : "Sync needs attention. See the account status.");
    } catch {
      setMessage("Sync failed. Try again.");
    }
  });
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" size="sm" onClick={run} disabled={pending || disabled}>
        {pending ? <Spinner /> : <RefreshCw />}{pending ? "Syncing…" : provider ? "Sync now" : "Sync accounts"}
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-muted-foreground">{message}</span>
    </div>
  );
}

export function ConnectionSettings({ provider, enabled, included, hasSnapshot }: {
  provider: Provider; enabled: boolean; included: boolean; hasSnapshot: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const run = (action: () => Promise<FormState>) => startTransition(async () => {
    try { const result = await action(); notify(result); if (result.ok) setConfirmOpen(false); }
    catch { notify({ ok: false, message: "The setting could not be saved. Try again." }); }
  });
  return (
    <div className="flex flex-col gap-4">
      <Field orientation="horizontal">
        <Checkbox id={`${provider}-enabled`} checked={enabled} disabled={pending}
          onCheckedChange={(checked) => run(() => updateConnection(provider, "enabled", checked === true))} />
        <FieldLabel htmlFor={`${provider}-enabled`}>Automatic daily sync</FieldLabel>
      </Field>
      <Field>
        <Field orientation="horizontal">
          <Checkbox id={`${provider}-included`} checked={included} disabled={pending || !hasSnapshot}
            onCheckedChange={(checked) => run(() => updateConnection(provider, "includeInNetWorth", checked === true))} />
          <FieldLabel htmlFor={`${provider}-included`}>Include in net worth</FieldLabel>
        </Field>
        <FieldDescription>Pausing sync keeps saved balances in your totals.</FieldDescription>
      </Field>
      <div className="flex flex-wrap items-start gap-2">
        <ConnectAccountButton provider={provider} connected />
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogTrigger asChild><Button variant="ghost" size="sm" disabled={pending}><Unplug /> Disconnect</Button></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Disconnect {PROVIDER_META[provider].name}?</AlertDialogTitle>
              <AlertDialogDescription>This removes its saved credentials and synced balances from this dashboard and your current totals. Past net-worth snapshots remain.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
              <Button variant="destructive" disabled={pending} onClick={() => run(() => disconnectAccount(provider))}>
                {pending && <Spinner />} Disconnect
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
