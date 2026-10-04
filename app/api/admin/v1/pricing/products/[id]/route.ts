import { z } from "zod";
import { getProductMeta } from "@/config/products";
import { notFound, requireDb, route } from "@/lib/admin-api";
import { parseProductPatch, updateProductSettings } from "@/lib/admin-api/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Up to two new Stripe prices, archiving and the product copy check.
export const maxDuration = 60;

/**
 * PATCH /pricing/products/:id { amount?, compareAt?, monthly?, trialDays?, active? }
 * -> { product, stripe }. Owner.
 *
 * `amount` and `monthly` go to Stripe one by one (a refusal answers 502
 * `stripe`); `compareAt`, `trialDays` and `active` are site settings and are
 * saved even when a price in the same request is refused.
 */
export const PATCH = route(
  { method: "PATCH", capability: "pricing.write", body: z.unknown() },
  async (_ctx, { params, body }) => {
    const meta = getProductMeta(params.id);
    if (!meta) throw notFound("That product");
    const patch = parseProductPatch(body, { hasCare: Boolean(meta.care) });
    return updateProductSettings(requireDb(), meta.id, patch);
  },
);
