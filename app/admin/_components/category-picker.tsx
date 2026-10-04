"use client";

import { useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Swatch } from "@/components/ui/swatch";
import { setCashFlowCategory } from "../_actions/cash-flows";
import type { FormCategory } from "./cash-flow-form";
import { notify } from "./form";

/**
 * A row's category, changeable in place: pick another one and the entry moves (the toast offers Undo).
 * Phones show only the chevron; the category name is in the row's details there.
 */
export function CategoryPicker({
  entryId,
  description,
  current,
  options,
}: {
  entryId: string;
  description: string;
  current: { id: number; name: string; color: string };
  /** Categories of the entry's kind (archived ones are left out). */
  options: FormCategory[];
}) {
  const [pending, startTransition] = useTransition();
  const choose = (value: string) => {
    const categoryId = Number(value);
    if (categoryId === current.id) return;
    startTransition(async () => {
      try {
        const result = await setCashFlowCategory(entryId, categoryId);
        const previous = result.previous;
        notify(result, result.ok && previous != null && previous !== categoryId ? () => setCashFlowCategory(entryId, previous, { undo: true }) : undefined);
      } catch {
        notify({ ok: false, message: "Couldn't change the category. Try again." });
      }
    });
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="subtle" size="xs" disabled={pending} aria-label={`Category for ${description}: ${current.name}. Change`} className="justify-between sm:w-32">
          <span className="hidden truncate sm:inline">{current.name}</span>
          {pending ? <Spinner /> : <ChevronDown />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={String(current.id)} onValueChange={choose}>
          {options
            .filter((c) => !c.archived || c.id === current.id)
            .map((c) => (
              <DropdownMenuRadioItem key={c.id} value={String(c.id)}>
                <Swatch color={c.color} size="sm" />
                {c.name}
              </DropdownMenuRadioItem>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
