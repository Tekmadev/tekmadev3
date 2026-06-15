"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { createCouponAction } from "@/app/admin/(dashboard)/coupons/actions";

const inputClass =
  "rounded-xl border border-line-strong bg-bg px-3 py-2.5 text-ink outline-none focus:border-gold";
const labelClass = "flex flex-col gap-1.5 text-sm text-ink-2";

type DiscountType = "percent" | "fixed";
type Scope = "monthly" | "setup" | "order";
type Duration = "once" | "repeating" | "forever";

export function CouponForm({ currency }: { currency: string }) {
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [scope, setScope] = useState<Scope>("monthly");
  const [duration, setDuration] = useState<Duration>("once");

  const durationApplies = scope !== "setup"; // setup bills once, so no duration choice

  const durationHelp =
    scope === "setup"
      ? "Applies to the one-time setup charge."
      : scope === "order"
        ? "Duration controls the monthly part; the setup fee is discounted once."
        : duration === "once"
          ? "Discount applies to the first month only."
          : duration === "forever"
            ? "Discount applies to every monthly invoice, for as long as they stay subscribed."
            : "Discount applies for the chosen number of months.";

  return (
    <form action={createCouponAction} className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Code (optional)
          <input
            name="code"
            type="text"
            placeholder="e.g. STARTUP50 — blank = auto"
            autoCapitalize="characters"
            className={cn(inputClass, "uppercase placeholder:normal-case placeholder:text-ink-4")}
          />
        </label>
        <label className={labelClass}>
          Internal label (optional)
          <input
            name="name"
            type="text"
            placeholder="e.g. Sub-5k startup discount"
            className={cn(inputClass, "placeholder:text-ink-4")}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Discount type
          <select
            name="discount_type"
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as DiscountType)}
            className={inputClass}
          >
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed amount off</option>
          </select>
        </label>

        {discountType === "percent" ? (
          <label className={labelClass}>
            Percent off
            <div className="relative">
              <input
                name="percent"
                type="number"
                min="1"
                max="100"
                step="1"
                defaultValue={20}
                className={cn(inputClass, "w-full pr-8")}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-4">
                %
              </span>
            </div>
          </label>
        ) : (
          <label className={labelClass}>
            Amount off ({currency.toUpperCase()})
            <input name="amount" type="number" min="1" step="1" defaultValue={100} className={inputClass} />
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Applies to
          <select
            name="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className={inputClass}
          >
            <option value="monthly">Monthly subscription</option>
            <option value="setup">Setup fee only</option>
            <option value="order">Whole order (monthly + setup)</option>
          </select>
        </label>

        {durationApplies && (
          <label className={labelClass}>
            Duration
            <select
              name="duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value as Duration)}
              className={inputClass}
            >
              <option value="once">First month only</option>
              <option value="repeating">A set number of months</option>
              <option value="forever">Forever</option>
            </select>
          </label>
        )}
      </div>

      {durationApplies && duration === "repeating" && (
        <label className={cn(labelClass, "max-w-[12rem]")}>
          Number of months
          <input name="duration_months" type="number" min="1" step="1" defaultValue={3} className={inputClass} />
        </label>
      )}

      <p className="-mt-1 text-xs text-ink-4">{durationHelp}</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Max redemptions (optional)
          <input
            name="max_redemptions"
            type="number"
            min="1"
            step="1"
            placeholder="Unlimited"
            className={cn(inputClass, "placeholder:text-ink-4")}
          />
        </label>
        <label className={labelClass}>
          Expires (optional)
          <input name="expires" type="date" className={inputClass} />
        </label>
      </div>

      <button
        type="submit"
        className="mt-1 self-start rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-bg transition-colors hover:bg-ink-2"
      >
        Create coupon
      </button>
    </form>
  );
}
