import { route } from "@/lib/admin-api";
import { signAsset } from "@/lib/admin-api/clients/sections/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /assets/:id/sign -> { url, thumbnailUrl, expiresAt }: a fresh signed
 * URL for a client file once the bundle's has expired. Anyone who may view clients.
 */
export const POST = route({ method: "POST", capability: "clients.view" }, (ctx, { params }) => signAsset(ctx, params.id));
