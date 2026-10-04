import { randomInt } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { business } from "@/config/site";
import type { CouponRow } from "@/lib/coupon-data";
import { withLiveCouponState } from "@/lib/coupon-data";
import { couponProducts, createCoupon, disableCoupon } from "@/lib/coupon-admin";
import type { CouponDuration as StripeDuration } from "@/lib/coupon-sync";
import { stripeSecret } from "@/lib/stripe-mode";
import { ApiError, badRequest, conflict, businessRule, notFound, notConfigured, upstream } from "../errors";
import { dbError, instant } from "../data";
import { readPlans, readProducts } from "../pricing/view";
import { endOfTorontoDay, isCalendarDay, torontoDay, torontoToday } from "./dates";
import {
  appScope,
  COUPON_SCOPES,
  isDealScope,
  isOneTime,
  MONTHLY_DURATIONS,
  scopeLabel,
  storedScope,
  type CouponDuration,
  type CouponScope,
} from "./scopes";

export { couponScopeOptions, type CouponScope, type CouponDuration } from "./scopes";

/**
 * Coupons for the admin API (app/api/admin/v1/coupons/**). The codes live in
 * Stripe (a coupon plus a promotion code) and are mirrored in `coupons`; the
 * Stripe and database steps are lib/coupon-admin.ts, shared with Admin,
 * Coupons. Rules and copy: docs/api-requests/coupons.md in the app repo and the
 * error table in the brief's section 11.
 */

export type CouponView = {
  id: string;
  code: string;
  label: string | null;
  discount: { type: "percent"; percent: number } | { type: "amount"; amount: number; currency: string };
  appliesTo: { value: CouponScope; label: string };
  duration: CouponDuration;
  months?: number;
  redeemed: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  status: "active" | "disabled";
  dealUrl?: string;
  createdAt: string;
};

export const COUPON_MESSAGES = {
  percent: "Percent off must be between 1 and 100.",
  amount: "Enter a fixed amount greater than zero.",
  months: "Enter a valid number of months (1 or more).",
  max: "Max redemptions must be 1 or more.",
  expires: "Enter a valid expiry date.",
  expirespast: "The expiry date must be in the future.",
  code: "That code isn't valid. Use letters, numbers and dashes.",
  dupe: "A coupon with that code already exists. Pick a different code.",
  noproducts: "No matching Stripe products yet. Save a price on the Pricing page first.",
  nostripe: "Stripe is not configured, so coupons can't be created.",
  type: "Pick Percent off or Fixed amount off.",
  scope: "Pick what the coupon applies to.",
  duration: "Pick how long the discount lasts.",
  label: "Keep the label to 80 characters or fewer.",
} as const;
type CouponErrorCode = keyof typeof COUPON_MESSAGES;

/** The deal link: the /start page skips the setup fee and applies the code (Admin, Coupons uses the same). */
export const dealUrl = (code: string) => `${business.url}/start?deal=${encodeURIComponent(code)}`;

/* ------------------------------------------------------------------ */
/* Shape                                                               */
/* ------------------------------------------------------------------ */

/** The app's Coupon, or null for a code scoped to a product that no longer exists. */
export function couponView(row: CouponRow, opts: { share: boolean }): CouponView | null {
  const scope = appScope(row.applies_to);
  if (!scope) return null;

  const discount: CouponView["discount"] =
    row.discount_type === "percent"
      ? { type: "percent", percent: Number(row.percent_off ?? 0) }
      : { type: "amount", amount: Math.round(Number(row.amount_off ?? 0)), currency: (row.currency || "CAD").toUpperCase() };

  // Stripe's "once" on a monthly charge is the first month; on a one-time charge it is that charge.
  let duration: CouponDuration;
  if (isOneTime(scope)) duration = "once";
  else if (row.duration === "once") duration = "first_month";
  else duration = row.duration;
  const months = duration === "repeating" && row.duration_in_months ? row.duration_in_months : undefined;

  const active = Boolean(row.active);
  const view: CouponView = {
    id: row.id,
    code: row.code,
    label: row.name?.trim() || null,
    discount,
    appliesTo: { value: scope, label: scopeLabel(scope) },
    duration,
    ...(months !== undefined ? { months } : {}),
    redeemed: row.times_redeemed ?? 0,
    maxRedemptions: row.max_redemptions ?? null,
    expiresAt: row.redeem_by ? torontoDay(new Date(row.redeem_by)) : null,
    status: active ? "active" : "disabled",
    createdAt: instant(row.created_at),
  };
  if (opts.share && active && isDealScope(scope)) view.dealUrl = dealUrl(row.code);
  return view;
}

const toViews = (rows: CouponRow[], share: boolean) =>
  rows.map((row) => couponView(row, { share })).filter((c): c is CouponView => c !== null);

/* ------------------------------------------------------------------ */
/* GET /coupons                                                        */
/* ------------------------------------------------------------------ */

/** Every coupon, newest first, with Stripe's live redemption count and state laid over. */
export async function listCoupons(db: SupabaseClient, opts: { share: boolean }): Promise<CouponView[]> {
  const { data, error } = await db
    .from("coupons")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw dbError("coupons list", error);
  return toViews(await withLiveCouponState((data ?? []) as CouponRow[]), opts.share);
}

/* ------------------------------------------------------------------ */
/* POST /coupons                                                       */
/* ------------------------------------------------------------------ */

const CODE_RE = /^[A-Z0-9-]{3,40}$/;
const LABEL_MAX = 80;
/** Stripe's largest amount (99,999,999 cents). */
const MAX_CENTS = 99_999_999;

/** "TKM-7Q4X": no 0/O or 1/I, so it reads cleanly over the phone. */
function autoCode(): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += alphabet[randomInt(alphabet.length)];
  return `TKM-${suffix}`;
}

/** 1 to 100 with at most two decimals (12.5% is fine), like Stripe. */
const twoDecimals = (p: number) => Math.abs(p * 100 - Math.round(p * 100)) < 1e-9;

/**
 * One zod schema per field of the New coupon sheet, each failing with the
 * contract's message for its code. parseNewCoupon runs them in form order,
 * because which fields apply depends on others (the discount type picks
 * percent or amount, a monthly scope needs a duration, repeating needs months).
 */
const FIELDS = {
  /** Blank means an auto code. Trimmed and uppercased. */
  code: z
    .string({ error: COUPON_MESSAGES.code })
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || CODE_RE.test(v), COUPON_MESSAGES.code),
  /** Internal, never shown to buyers. Blank means none. */
  label: z.string({ error: COUPON_MESSAGES.label }).trim().max(LABEL_MAX, COUPON_MESSAGES.label),
  type: z.enum(["percent", "amount"], { error: COUPON_MESSAGES.type }),
  percent: z
    .number({ error: COUPON_MESSAGES.percent })
    .min(1, COUPON_MESSAGES.percent)
    .max(100, COUPON_MESSAGES.percent)
    .refine(twoDecimals, COUPON_MESSAGES.percent),
  amount: z
    .number({ error: COUPON_MESSAGES.amount })
    .int(COUPON_MESSAGES.amount)
    .positive(COUPON_MESSAGES.amount)
    .max(MAX_CENTS, COUPON_MESSAGES.amount),
  appliesTo: z.enum(COUPON_SCOPES, { error: COUPON_MESSAGES.scope }),
  duration: z.enum(MONTHLY_DURATIONS, { error: COUPON_MESSAGES.duration }),
  months: z.number({ error: COUPON_MESSAGES.months }).int(COUPON_MESSAGES.months).min(1, COUPON_MESSAGES.months),
  maxRedemptions: z.number({ error: COUPON_MESSAGES.max }).int(COUPON_MESSAGES.max).min(1, COUPON_MESSAGES.max),
  /** A real calendar day: 2027-02-31 has the right shape but is refused. */
  expiresAt: z.string({ error: COUPON_MESSAGES.expires }).refine(isCalendarDay, COUPON_MESSAGES.expires),
};

type NewCoupon = {
  code: string | null;
  label: string | null;
  discount: { type: "percent"; percent: number } | { type: "amount"; amount: number };
  scope: CouponScope;
  duration: CouponDuration;
  months: number | undefined;
  maxRedemptions: number | null;
  expiresAt: string | null;
};

/**
 * The New coupon sheet's flat body (docs/api-requests/coupons.md section 2).
 * Every bad field is reported in `fields`; `code` and `message` are the first
 * problem in form order (code, label, type, percent or amount, appliesTo,
 * duration, months, maxRedemptions, expiresAt).
 */
export function parseNewCoupon(raw: unknown): NewCoupon {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const errors: { code: CouponErrorCode; field: string }[] = [];

  /** The parsed value, or undefined after recording the field's error. */
  function check<S extends z.ZodType>(schema: S, value: unknown, code: CouponErrorCode, field: string): z.output<S> | undefined {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    errors.push({ code, field });
    return undefined;
  }
  const given = (value: unknown) => value !== undefined && value !== null;

  // Blank code: an auto code. Blank label: none.
  const code = given(body.code) ? (check(FIELDS.code, body.code, "code", "code") || null) : null;
  const label = given(body.label) ? (check(FIELDS.label, body.label, "label", "label") || null) : null;

  let discount: NewCoupon["discount"] | null = null;
  const type = check(FIELDS.type, body.type, "type", "type");
  if (type === "percent") {
    const percent = check(FIELDS.percent, body.percent, "percent", "percent");
    if (percent !== undefined) discount = { type, percent: Math.round(percent * 100) / 100 };
  } else if (type === "amount") {
    const amount = check(FIELDS.amount, body.amount, "amount", "amount");
    if (amount !== undefined) discount = { type, amount };
  }

  const scope = check(FIELDS.appliesTo, body.appliesTo, "scope", "appliesTo");

  // One-time scopes always apply once, whatever was sent; monthly scopes must pick.
  let duration: CouponDuration = "once";
  let months: number | undefined;
  if (scope && !isOneTime(scope)) {
    const picked = check(FIELDS.duration, body.duration, "duration", "duration");
    if (picked) duration = picked;
    if (picked === "repeating") months = check(FIELDS.months, body.months, "months", "months");
  }

  // Null or missing: unlimited.
  const maxRedemptions = given(body.maxRedemptions)
    ? (check(FIELDS.maxRedemptions, body.maxRedemptions, "max", "maxRedemptions") ?? null)
    : null;

  // A Toronto calendar day after today.
  let expiresAt: string | null = null;
  if (given(body.expiresAt)) {
    const day = check(FIELDS.expiresAt, body.expiresAt, "expires", "expiresAt");
    if (day !== undefined && day <= torontoToday()) errors.push({ code: "expirespast", field: "expiresAt" });
    else if (day !== undefined) expiresAt = day;
  }

  if (errors.length > 0 || !discount || !scope) {
    const first = errors[0] ?? { code: "type" as const, field: "type" };
    const fields: Record<string, string> = {};
    for (const e of errors) fields[e.field] ??= COUPON_MESSAGES[e.code];
    throw badRequest(first.code, COUPON_MESSAGES[first.code], fields);
  }

  return { code, label, discount, scope, duration, months, maxRedemptions, expiresAt };
}

const dupe = () => conflict("dupe", COUPON_MESSAGES.dupe, { code: COUPON_MESSAGES.dupe });

/** Whether a code is taken, in any case, disabled coupons included. Codes hold only A-Z, 0-9 and dashes, so ilike is an exact match. */
async function codeTaken(db: SupabaseClient, code: string): Promise<boolean> {
  const { data, error } = await db.from("coupons").select("id").ilike("code", code).limit(1);
  if (error) throw dbError("coupon code check", error);
  return (data ?? []).length > 0;
}

/**
 * POST /coupons: checks in the contract's order (503 nostripe, 400 fields,
 * 409 dupe, 422 noproducts), then creates the code in Stripe and the table.
 * The label stays internal: it is stored here and never sent to Stripe, where
 * a coupon's name prints on invoices.
 */
export async function createCouponFromApp(db: SupabaseClient, raw: unknown, opts: { share: boolean }): Promise<CouponView> {
  const secret = stripeSecret("live");
  if (!secret) throw new ApiError(503, "nostripe", COUPON_MESSAGES.nostripe);

  const input = parseNewCoupon(raw);
  if (input.code && (await codeTaken(db, input.code))) throw dupe();

  // The Stripe products the scope is limited to (lib/coupon-admin.ts, same as Admin, Coupons).
  const [plans, products] = await Promise.all([readPlans(db), readProducts(db)]);
  const scope = storedScope(input.scope);
  const { productIds, currency } = couponProducts(scope, plans, products);
  const hasProducts =
    input.scope === "anything"
      ? plans.some((p) => Boolean(p.stripe_product_id)) || products.some((p) => Boolean(p.stripe_product_id))
      : productIds.length > 0;
  if (!hasProducts) throw businessRule("noproducts", COUPON_MESSAGES.noproducts, { appliesTo: COUPON_MESSAGES.noproducts });

  // first_month is Stripe's "once" on a monthly price.
  const stripeDuration: StripeDuration = input.duration === "repeating" ? "repeating" : input.duration === "forever" ? "forever" : "once";
  const redeemBy = input.expiresAt ? endOfTorontoDay(input.expiresAt) : null;

  // An auto code is retried if it is taken (here, or in the Stripe account, which other sites share).
  const attempts = input.code ? 1 : 6;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let code = input.code;
    if (!code) {
      code = autoCode();
      if (await codeTaken(db, code)) continue;
    }
    const res = await createCoupon({
      secret,
      code,
      name: input.label,
      nameInStripe: false,
      discountType: input.discount.type === "percent" ? "percent" : "fixed",
      percentOff: input.discount.type === "percent" ? input.discount.percent : undefined,
      amountOffCents: input.discount.type === "amount" ? input.discount.amount : undefined,
      currency,
      scope,
      duration: stripeDuration,
      durationInMonths: input.months,
      maxRedemptions: input.maxRedemptions,
      redeemBy,
      productIds,
    });
    if (res.ok) {
      revalidatePath("/admin/coupons");
      const view = couponView(res.row, opts);
      if (!view) throw new ApiError(500, "unavailable", "The coupon was created, but could not be shown. Pull to refresh.");
      return view;
    }
    if (res.error === "dupe") {
      if (input.code) throw dupe();
      continue;
    }
    if (res.error === "stripe") throw upstream("stripe", "Stripe did not accept that coupon, so nothing was created. Check the values and try again.");
    throw new ApiError(500, "db", "Could not save the coupon, so it was switched off in Stripe again. Try again in a moment.");
  }
  throw new ApiError(500, "unavailable", "Could not pick a free code just now. Try again, or type a code.");
}

/* ------------------------------------------------------------------ */
/* POST /coupons/:id/disable                                           */
/* ------------------------------------------------------------------ */

/**
 * Disables a code in Stripe and the table. Already disabled answers the same
 * coupon, so a retry after a dropped connection is harmless. No re-enable.
 */
export async function disableCouponFromApp(db: SupabaseClient, id: string, opts: { share: boolean }): Promise<CouponView> {
  const { data, error } = await db.from("coupons").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("coupon read", error);
  if (!data) throw notFound("That coupon");
  const row = data as CouponRow;

  if (row.active) {
    const res = await disableCoupon(id);
    if (!res.ok) {
      if (res.error === "config") throw notConfigured();
      if (res.error === "stripe") throw upstream("stripe", "Stripe did not disable the code, so it still works at checkout. Try again in a moment.");
      throw new ApiError(500, "db", "Stripe disabled the code, but the list could not be updated. Try again in a moment.");
    }
    revalidatePath("/admin/coupons");
  }

  const [live] = await withLiveCouponState([{ ...row, active: false }]);
  const view = couponView({ ...(live ?? row), active: false }, opts);
  if (!view) throw notFound("That coupon");
  return view;
}
