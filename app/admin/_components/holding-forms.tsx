"use client";

import { useId, useState } from "react";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { applyAdjustment } from "@/lib/finance/calc";
import {
  ASSET_CLASSES,
  ASSET_CLASS_META,
  COINGECKO_PRESETS,
  CURRENCIES,
  PRICE_SOURCE_LABELS,
  PRICE_SOURCES,
  type AssetClass,
  type PriceSource,
} from "@/lib/finance/constants";
import { formatPrice, formatQty } from "@/lib/finance/format";
import { adjustHolding, saveHolding, updateManualPrices } from "../_actions/holdings";
import { FormField, FormFooter, useFormAction } from "./form";
import { EmptyState } from "./ui";

export interface HoldingDTO {
  id: string;
  assetClass: AssetClass;
  name: string;
  symbol: string | null;
  platform: string | null;
  quantity: number;
  avgCost: number;
  currency: string;
  priceSource: PriceSource;
  priceRef: string | null;
  lastPrice: number | null;
  notes: string | null;
}

function suggestSource(assetClass: AssetClass, currency: string): PriceSource {
  if (assetClass === "crypto") return "coingecko";
  if ((assetClass === "stock" || assetClass === "etf") && currency === "USD") return "finnhub";
  return "manual";
}

export function HoldingForm({ holding }: { holding?: HoldingDTO }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(saveHolding);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const [assetClass, setAssetClass] = useState<AssetClass>(holding?.assetClass ?? "stock");
  const [currency, setCurrency] = useState(holding?.currency ?? "PHP");
  const [source, setSource] = useState<PriceSource>(holding?.priceSource ?? "manual");
  // Suggest a price source until one is picked explicitly.
  const [sourcePicked, setSourcePicked] = useState(Boolean(holding));
  const [symbol, setSymbol] = useState(holding?.symbol ?? "");

  const isCash = assetClass === "cash";
  const preset = COINGECKO_PRESETS[symbol.trim().toUpperCase()];

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      {holding && <input type="hidden" name="id" value={holding.id} />}
      {/* Cash has no price source field; it's always valued at face value. */}
      {isCash && <input type="hidden" name="priceSource" value="manual" />}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField id={id("class")} label="Asset class" error={error("assetClass")}>
          <Select
            name="assetClass"
            value={assetClass}
            onValueChange={(value) => {
              const next = value as AssetClass;
              setAssetClass(next);
              if (!sourcePicked) setSource(suggestSource(next, currency));
            }}
          >
            <SelectTrigger id={id("class")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_CLASSES.map((c) => (
                <SelectItem key={c} value={c}>
                  {ASSET_CLASS_META[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField id={id("currency")} label="Currency" error={error("currency")}>
          <Select
            name="currency"
            value={currency}
            onValueChange={(value) => {
              setCurrency(value);
              if (!sourcePicked) setSource(suggestSource(assetClass, value));
            }}
          >
            <SelectTrigger id={id("currency")} className="w-full" aria-invalid={Boolean(error("currency"))}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField id={id("name")} label="Name" error={error("name")}>
          <Input
            id={id("name")}
            name="name"
            maxLength={120}
            placeholder={isCash ? "BPI Savings" : "Bitcoin"}
            defaultValue={holding?.name}
            aria-invalid={Boolean(error("name"))}
          />
        </FormField>
        <FormField id={id("symbol")} label="Symbol" error={error("symbol")} description="Optional — BTC, JFC, VOO">
          <Input id={id("symbol")} name="symbol" maxLength={20} autoCapitalize="characters" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        </FormField>
        <FormField id={id("platform")} label="Held at" error={error("platform")} description="COL, Binance, GCash…" wide>
          <Input id={id("platform")} name="platform" maxLength={60} defaultValue={holding?.platform ?? undefined} />
        </FormField>

        {!isCash && (
          <>
            <FormField id={id("source")} label="Price source" error={error("priceSource")}>
              <Select
                name="priceSource"
                value={source}
                onValueChange={(value) => {
                  setSource(value as PriceSource);
                  setSourcePicked(true);
                }}
              >
                <SelectTrigger id={id("source")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_SOURCES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {PRICE_SOURCE_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            {source === "manual" ? (
              <FormField id={id("price")} label={`Current price (${currency})`} error={error("lastPrice")} description="Blank = valued at cost">
                <Input
                  id={id("price")}
                  name="lastPrice"
                  inputMode="decimal"
                  defaultValue={holding?.priceSource === "manual" ? (holding.lastPrice ?? undefined) : undefined}
                  aria-invalid={Boolean(error("lastPrice"))}
                />
              </FormField>
            ) : (
              <FormField
                id={id("ref")}
                label={source === "coingecko" ? "CoinGecko API id" : "Ticker"}
                error={error("priceRef")}
                description={
                  source === "coingecko"
                    ? preset
                      ? `Blank = "${preset}"`
                      : "The coin's API id on CoinGecko"
                    : "US listing, priced in USD. Blank = symbol"
                }
              >
                <Input
                  id={id("ref")}
                  name="priceRef"
                  maxLength={80}
                  placeholder={source === "coingecko" ? (preset ?? "bitcoin") : symbol.toUpperCase() || "VOO"}
                  defaultValue={holding?.priceSource === source ? (holding.priceRef ?? undefined) : undefined}
                  aria-invalid={Boolean(error("priceRef"))}
                />
              </FormField>
            )}
          </>
        )}

        <FormField id={id("qty")} label={isCash ? "Balance" : "Quantity"} error={error("quantity")}>
          <Input id={id("qty")} name="quantity" inputMode="decimal" defaultValue={holding?.quantity} aria-invalid={Boolean(error("quantity"))} />
        </FormField>
        {!isCash && (
          <FormField id={id("avg")} label={`Avg cost / unit (${currency})`} error={error("avgCost")}>
            <Input id={id("avg")} name="avgCost" inputMode="decimal" defaultValue={holding?.avgCost} aria-invalid={Boolean(error("avgCost"))} />
          </FormField>
        )}
        <FormField id={id("notes")} label="Notes" error={error("notes")} wide>
          <Input id={id("notes")} name="notes" maxLength={500} defaultValue={holding?.notes ?? undefined} />
        </FormField>

        <FormFooter state={state} pending={pending}>
          {pending && !isCash && source !== "manual" ? "Checking price…" : holding ? "Save" : "Add holding"}
        </FormFooter>
      </FieldGroup>
    </form>
  );
}

const toNumber = (value: string) => (value.trim() === "" ? NaN : Number(value.replace(/[,\s₱]/g, "")));

export function AdjustForm({ holding }: { holding: HoldingDTO }) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(adjustHolding);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  const isCash = holding.assetClass === "cash";
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("");

  const q = toNumber(quantity);
  const preview = Number.isFinite(q)
    ? applyAdjustment(
        holding,
        type === "buy"
          ? { type, quantity: q, price: isCash ? 1 : toNumber(price), fee: fee.trim() ? toNumber(fee) : 0 }
          : { type, quantity: q }
      )
    : null;

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="id" value={holding.id} />
      <input type="hidden" name="type" value={type} />
      {isCash && type === "buy" && <input type="hidden" name="price" value="1" />}

      <p className="text-sm text-muted-foreground">
        You hold <strong className="text-foreground tabular-nums">{formatQty(holding.quantity)}</strong>
        {!isCash && <> @ {formatPrice(holding.avgCost, holding.currency)} avg</>}.
      </p>
      <ToggleGroup
        type="single"
        variant="outline"
        value={type}
        onValueChange={(value) => value && setType(value as "buy" | "sell")}
        aria-label="Adjustment type"
      >
        <ToggleGroupItem value="buy">{isCash ? "Deposit" : "Bought more"}</ToggleGroupItem>
        <ToggleGroupItem value="sell">{isCash ? "Withdraw" : "Sold some"}</ToggleGroupItem>
      </ToggleGroup>

      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={id("qty")}
          label={isCash ? "Amount" : type === "buy" ? "Quantity bought" : "Quantity sold"}
          error={error("quantity")}
          wide={isCash || type === "sell"}
        >
          <Input
            id={id("qty")}
            name="quantity"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-invalid={Boolean(error("quantity"))}
          />
        </FormField>
        {!isCash && type === "buy" && (
          <>
            <FormField id={id("price")} label={`Price / unit (${holding.currency})`} error={error("price")}>
              <Input id={id("price")} name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
            </FormField>
            <FormField id={id("fee")} label={`Fees (${holding.currency})`} error={error("fee")} description="Optional — added to cost basis" wide>
              <Input id={id("fee")} name="fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
            </FormField>
          </>
        )}
        {preview && (
          <p className="font-mono text-xs sm:col-span-2">
            {preview.ok ? (
              <>
                New position: {formatQty(preview.quantity)}
                {!isCash && <> @ {formatPrice(preview.avgCost, holding.currency)} avg</>}
              </>
            ) : (
              <span className="text-destructive">{preview.error}</span>
            )}
          </p>
        )}
        <FormFooter state={state} pending={pending}>
          Apply
        </FormFooter>
      </FieldGroup>
    </form>
  );
}

/** Edit sheet body: adjust the position or edit its details. */
export function HoldingEditor({ holding }: { holding: HoldingDTO }) {
  return (
    <Tabs defaultValue="adjust">
      <TabsList>
        <TabsTrigger value="adjust">Adjust</TabsTrigger>
        <TabsTrigger value="details">Details</TabsTrigger>
      </TabsList>
      <TabsContent value="adjust">
        <AdjustForm holding={holding} />
      </TabsContent>
      <TabsContent value="details">
        <HoldingForm holding={holding} />
      </TabsContent>
    </Tabs>
  );
}

export function BulkPriceForm({
  holdings,
}: {
  holdings: { id: string; name: string; symbol: string | null; currency: string; lastPrice: number | null; lastSet: string | null }[];
}) {
  const { state, pending, onSubmit, formKey, error } = useFormAction(updateManualPrices);
  const uid = useId();

  if (holdings.length === 0) {
    return <EmptyState title="Nothing to update">Holdings with a manual price source (PSE stocks, UITFs, property…) show up here.</EmptyState>;
  }

  return (
    <form key={formKey} onSubmit={onSubmit} noValidate>
      <FieldGroup className="grid gap-4">
        {holdings.map((h) => {
          const name = `price:${h.id}`;
          return (
            <FormField
              key={h.id}
              id={`${uid}-${h.id}`}
              label={`${h.name}${h.symbol ? ` · ${h.symbol}` : ""} (${h.currency})`}
              error={error(name)}
              description={h.lastSet ? `Last set ${h.lastSet}` : "No price yet — valued at cost"}
            >
              <Input id={`${uid}-${h.id}`} name={name} inputMode="decimal" defaultValue={h.lastPrice ?? undefined} aria-invalid={Boolean(error(name))} />
            </FormField>
          );
        })}
        <FormFooter state={state} pending={pending}>
          Update prices
        </FormFooter>
      </FieldGroup>
    </form>
  );
}
