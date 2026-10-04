import { requireDb, route } from "@/lib/admin-api";
import { getPricing } from "@/lib/admin-api/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /pricing -> { plans, products, salesTax }. Owner and staff (read only).
 * Plans cheapest monthly first; products as the site lists them; the sales tax
 * card reads Stripe Tax fresh, like Admin, Pricing.
 */
export const GET = route({ method: "GET", capability: "pricing.view" }, async () => getPricing(requireDb()));
