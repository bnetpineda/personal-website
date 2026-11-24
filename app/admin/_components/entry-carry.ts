/** The fields "Add another" keeps from the entry just saved; the amount and description start blank. */
export interface CarriedEntry {
  occurredOn?: string;
  currency?: string;
  categoryId?: number;
  account?: string;
}

export function carryOver(data: Pick<FormData, "get">): CarriedEntry {
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  const category = Number(text("categoryId"));
  const carried: CarriedEntry = {};
  const occurredOn = text("occurredOn");
  if (occurredOn && /^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) carried.occurredOn = occurredOn;
  const currency = text("currency");
  if (currency) carried.currency = currency;
  if (Number.isInteger(category) && category > 0) carried.categoryId = category;
  const account = text("account");
  if (account) carried.account = account;
  return carried;
}
