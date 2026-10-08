import { adminCan, type AdminContext } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { OPEN_STATUSES, demoSchemaMissing, type DemoActor, type DemoStatus } from "@/lib/admin-api/demos";

/**
 * What the web admin's demo pages need beyond the shared demo code
 * (lib/admin-api/demos, the same rules and copy as the admin API): the
 * signed-in admin as a demo actor, the demo forms as API bodies, who the new
 * request form is for, and demo counts for the Leads page.
 */

/** The signed-in admin, as lib/admin-api/demos expects a caller. */
export function demoActorFor(ctx: AdminContext): DemoActor {
  return { userId: ctx.user.id, email: ctx.email, name: ctx.name, can: (capability) => adminCan(ctx, capability) };
}

const text = (formData: FormData, key: string): string | null => {
  const v = formData.get(key);
  return typeof v === "string" ? v : null;
};

/** The business block of a demo form. */
function businessFrom(formData: FormData) {
  return {
    name: text(formData, "business_name") ?? "",
    type: text(formData, "business_type") ?? "",
    area: text(formData, "area") ?? "",
    offer: text(formData, "offer") ?? "",
    website: text(formData, "website"),
    brand: text(formData, "brand"),
    customers: text(formData, "customers"),
  };
}

/**
 * The new request form as a POST /demos body. "Already built? Demo link"
 * (only on the form for `demos.manage`) is sent as demoUrl when the form has
 * it, like the app; createDemo still refuses a link from anyone else (403).
 */
export function demoCreateBodyFromForm(formData: FormData): Record<string, unknown> {
  return {
    clientId: text(formData, "client_id") || undefined,
    leadId: text(formData, "lead_id") || undefined,
    business: businessFrom(formData),
    wants: text(formData, "wants"),
    neededBy: text(formData, "needed_by"),
    ...(formData.has("demo_url") ? { demoUrl: text(formData, "demo_url") } : {}),
    idempotencyKey: text(formData, "idempotency_key") || undefined,
  };
}

/** The edit details form as a PATCH /demos/:id body. */
export function demoEditBodyFromForm(formData: FormData): Record<string, unknown> {
  return { business: businessFrom(formData), wants: text(formData, "wants"), neededBy: text(formData, "needed_by") };
}

/** The builder's form as a PATCH /demos/:id body: link, builder and note, and the status of the button pressed. */
export function demoManageBodyFromForm(formData: FormData): Record<string, unknown> {
  const status = text(formData, "status");
  return {
    demoUrl: text(formData, "demo_url"),
    builderEmail: text(formData, "builder_email"),
    builderNote: text(formData, "builder_note"),
    ...(status ? { status } : {}),
  };
}

export type DemoTarget = {
  kind: "client" | "lead";
  id: string;
  /** How it reads on screen. */
  label: string;
  /** Prefill for the form. */
  businessName: string;
  area: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who a new demo request is for, by the same rules as POST /demos: a live
 * client (a test one only for roles that see test data), or a lead. Null when
 * there is none or both were given.
 */
export async function demoTargetFor(ctx: AdminContext, q: { clientId?: string; leadId?: string }): Promise<DemoTarget | null> {
  const db = getSupabaseAdmin();
  if (!db) return null;
  const clientId = q.clientId?.trim() || "";
  const leadId = q.leadId?.trim() || "";
  if (Boolean(clientId) === Boolean(leadId)) return null;
  if (clientId) {
    if (!UUID_RE.test(clientId)) return null;
    const { data } = await db.from("clients").select("id,business_name,service_area,is_test,deleted_at").eq("id", clientId).maybeSingle();
    const c = data as { id: string; business_name: string | null; service_area: string | null; is_test: boolean | null; deleted_at: string | null } | null;
    if (!c || c.deleted_at || (c.is_test && !adminCan(ctx, "testdata.view"))) return null;
    const name = c.business_name?.trim() || "";
    return { kind: "client", id: c.id, label: name || "This client", businessName: name, area: c.service_area?.trim() || "" };
  }
  if (!UUID_RE.test(leadId)) return null;
  const { data } = await db.from("leads").select("id,business_name,name,email").eq("id", leadId).maybeSingle();
  const l = data as { id: string; business_name: string | null; name: string | null; email: string | null } | null;
  if (!l) return null;
  const business = l.business_name?.trim() || "";
  return { kind: "lead", id: l.id, label: business || l.name?.trim() || l.email?.trim() || "This lead", businessName: business, area: "" };
}

export type LeadDemoCount = { open: number; total: number };

/** PostgREST puts filter values in the URL: ask for at most this many leads at a time. */
const ID_CHUNK = 100;

/**
 * Demo requests per lead, for the Leads page (test requests only for roles
 * that see test data). A failed read, or no migration yet, answers an empty
 * map: the page still renders.
 */
export async function demoCountsByLead(ctx: AdminContext, leadIds: readonly string[]): Promise<Map<string, LeadDemoCount>> {
  const out = new Map<string, LeadDemoCount>();
  const db = getSupabaseAdmin();
  const ids = [...new Set(leadIds.filter((id) => UUID_RE.test(id)))];
  if (!db || ids.length === 0) return out;
  const seesTest = adminCan(ctx, "testdata.view");
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    let q = db.from("demo_requests").select("lead_id,status").in("lead_id", ids.slice(i, i + ID_CHUNK));
    if (!seesTest) q = q.eq("is_test", false);
    const { data, error } = await q.limit(5000);
    if (error) {
      if (!demoSchemaMissing(error)) console.error("[demos] lead counts failed", error.code, error.message);
      return new Map();
    }
    for (const row of (data ?? []) as { lead_id: string; status: string }[]) {
      const c = out.get(row.lead_id) ?? { open: 0, total: 0 };
      c.total += 1;
      if (OPEN_STATUSES.includes(row.status as DemoStatus)) c.open += 1;
      out.set(row.lead_id, c);
    }
  }
  return out;
}
