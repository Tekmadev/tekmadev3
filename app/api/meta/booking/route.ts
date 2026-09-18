import { NextResponse, type NextRequest } from "next/server";
import { isContextId, linkBookingToContext } from "@/lib/ad-context-data";
import { reportBooking } from "@/lib/meta-conversions";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The browser tells us which ad context a finished Cal booking belongs to.
 * If the Cal webhook has already recorded the booking, this is the second
 * half arriving and the conversion goes out now; otherwise the webhook sends
 * it when it lands. See reportBooking.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(`meta-booking:${clientIp(req.headers)}`, 10, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: false }, { status: 429 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const uid = typeof body.uid === "string" ? body.uid.trim().slice(0, 120) : "";
  if (!uid || !isContextId(body.ctx)) return NextResponse.json({ ok: false }, { status: 400 });

  const linked = await linkBookingToContext(body.ctx, uid);
  if (linked) await reportBooking(uid);
  return NextResponse.json({ ok: linked });
}
