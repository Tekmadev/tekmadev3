import { z } from "zod";
import { requireDb, route } from "@/lib/admin-api";
import { parseSalesTax, setSalesTaxMode } from "@/lib/admin-api/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /pricing/sales-tax { mode: "live" | "test", on } -> the whole `salesTax`
 * card (same shape as in GET /pricing). Owner. Records who flipped it and
 * leaves a line in the inbox, like Admin, Pricing.
 * 503 `not_configured` without Stripe, or for test mode without a sandbox.
 */
export const PUT = route(
  { method: "PUT", capability: "pricing.write", body: z.unknown() },
  async (ctx, { body }) => setSalesTaxMode(requireDb(), parseSalesTax(body), ctx.email),
);
