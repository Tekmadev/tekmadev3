import { z } from "zod";
import { badRequest, validationError } from "../errors";

/**
 * Body rules for the pricing writes (docs/api-requests/pricing.md sections 2,
 * 4 and 5 in the app repo), as zod schemas. A bad body answers one code and
 * message for the whole form, with every bad field in `fields` under the key
 * the app sent.
 */

export const INPUT_MESSAGE = "Enter valid, non-negative numbers.";
const AMOUNT_FIELD = "Enter an amount of 0 or more.";
const COMPARE_FIELD = "Enter an amount of 0 or more, or leave it empty.";
const TRIAL_FIELD = "Enter a number of days from 1 to 365.";
const ACTIVE_FIELD = "Turn Purchasable on or off.";
const NO_CARE_FIELD = "This product has no monthly plan.";
export const COMPARE_AT_MESSAGE = "The compare-at price must be higher than the one-time fee.";

/** Stripe's largest unit amount (99,999,999 cents). */
const MAX_CENTS = 99_999_999;

/** Integer cents, 0 or more. */
const cents = (message: string) => z.number({ error: message }).int(message).min(0, message).max(MAX_CENTS, message);

const asRecord = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

/** Parse, or throw one 400 `code` "message" with every bad field in `fields`. */
function parseForm<S extends z.ZodType>(schema: S, raw: unknown, code: string, message: string): z.output<S> {
  const parsed = schema.safeParse(asRecord(raw));
  if (parsed.success) return parsed.data;
  throw badRequest(code, message, validationError(parsed.error).fields);
}

const planPatchSchema = z.object({
  monthly: cents(AMOUNT_FIELD).optional(),
  setup: cents(AMOUNT_FIELD).optional(),
});

export type PlanPatch = z.output<typeof planPatchSchema>;

/** PATCH /pricing/plans/:id `{ monthly?, setup? }`, cents. 400 `input` otherwise. */
export function parsePlanPatch(raw: unknown): PlanPatch {
  return parseForm(planPatchSchema, raw, "input", INPUT_MESSAGE);
}

function productPatchSchema(hasCare: boolean) {
  return z.object({
    amount: cents(AMOUNT_FIELD).optional(),
    /** null removes the struck-through price. */
    compareAt: cents(COMPARE_FIELD).nullable().optional(),
    monthly: hasCare ? cents(AMOUNT_FIELD).optional() : z.undefined({ error: NO_CARE_FIELD }),
    trialDays: z.number({ error: TRIAL_FIELD }).int(TRIAL_FIELD).min(1, TRIAL_FIELD).max(365, TRIAL_FIELD).optional(),
    active: z.boolean({ error: ACTIVE_FIELD }).optional(),
  });
}

export type ProductPatch = { amount?: number; compareAt?: number | null; monthly?: number; trialDays?: number; active?: boolean };

/** PATCH /pricing/products/:id `{ amount?, compareAt?, monthly?, trialDays?, active? }`. 400 `input` otherwise. */
export function parseProductPatch(raw: unknown, opts: { hasCare: boolean }): ProductPatch {
  return parseForm(productPatchSchema(opts.hasCare), raw, "input", INPUT_MESSAGE);
}

const salesTaxSchema = z.object({
  mode: z.enum(["live", "test"], { error: 'Send "live" or "test".' }),
  on: z.boolean({ error: "Send true or false." }),
});

export type SalesTaxInput = z.output<typeof salesTaxSchema>;

/** PUT /pricing/sales-tax `{ mode, on }`. 400 `tax` otherwise. */
export function parseSalesTax(raw: unknown): SalesTaxInput {
  return parseForm(salesTaxSchema, raw, "tax", "Pick live or test mode, and on or off.");
}
