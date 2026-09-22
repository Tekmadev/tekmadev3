"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BlogCategory } from "@/lib/blog-data";
import type { QuickCategoryResult } from "@/app/admin/(dashboard)/blog/actions";

const INPUT =
  "w-full rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-sm text-ink outline-none focus:border-gold";
const ICON_BUTTON =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line-strong text-ink-2 transition-colors hover:border-gold hover:text-gold disabled:cursor-wait disabled:opacity-60";

/**
 * The editor's Category select with a "+" that creates a category in place.
 *
 * It sits inside the post form, so nothing here may submit that form: the
 * buttons are type="button" and Enter in the name box is caught. The create
 * is a direct server-action call; the new category is appended to the list
 * and selected, and the half-written post around it is left exactly as it
 * was. The page it lives on is owner-gated, so anyone who sees the "+" may
 * use it, and the action checks again on the server.
 */
export function CategoryPicker({
  categories: initial,
  defaultValue,
  create,
}: {
  categories: BlogCategory[];
  defaultValue?: string | null;
  create: (name: string) => Promise<QuickCategoryResult>;
}) {
  const id = useId();
  const [categories, setCategories] = useState(initial);
  const [value, setValue] = useState(defaultValue ?? "");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectRef = useRef<HTMLSelectElement>(null);

  function open() {
    setAdding(true);
    setError(null);
  }

  function close() {
    setAdding(false);
    setName("");
    setError(null);
    selectRef.current?.focus();
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Type a name first.");
      return;
    }
    startTransition(async () => {
      const result = await create(trimmed);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const added = result.category;
      setCategories((list) => [...list.filter((c) => c.id !== added.id), added].sort((a, b) => a.name.localeCompare(b.name)));
      setValue(added.id);
      close();
    });
  }

  return (
    <div className="flex flex-col gap-1.5 text-sm text-ink-2">
      <label htmlFor={id} className="font-medium text-ink">
        Category
      </label>
      <div className="flex items-center gap-2">
        <select
          id={id}
          ref={selectRef}
          name="category_id"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={INPUT}
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {!adding && (
          <button type="button" onClick={open} aria-label="Add a category" title="Add a category" className={ICON_BUTTON}>
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={name}
              maxLength={60}
              // readOnly, not disabled: disabling blurs the box, and after a
              // "name taken" reply the person should still be typing in it.
              readOnly={pending}
              placeholder="New category name"
              aria-label="New category name"
              aria-invalid={error ? true : undefined}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                // Enter would submit the post form around us.
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  close();
                }
              }}
              className={cn(INPUT, error && "border-signal")}
            />
            <button type="button" onClick={submit} disabled={pending} aria-label="Save category" title="Save" className={ICON_BUTTON}>
              <Check className="h-4 w-4" />
            </button>
            <button type="button" onClick={close} disabled={pending} aria-label="Cancel" title="Cancel" className={ICON_BUTTON}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <span className={cn("text-xs", error ? "text-signal" : "text-ink-4")} role={error ? "alert" : undefined}>
            {error ?? (pending ? "Adding…" : "Enter to add, Esc to cancel. It becomes this post's category.")}
          </span>
        </div>
      )}
    </div>
  );
}
