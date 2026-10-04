import { z } from "zod";
import { ApiError, conflict, dbError, instant, isUuid, notFound, requireDb, type ApiContext } from "@/lib/admin-api";
import { inviteMember } from "@/lib/client-provisioning";
import { sendMemberLink } from "@/lib/client-sections-data";
import { logActivity, updateMember as saveMember, type Client, type ClientMember, type MemberRole, type MemberStatus } from "@/lib/clients-data";
import { COPY, exactIlike, findSectionClient, parseBody, zText } from "./shared";

/**
 * The client's portal team: the list in the bundle, "Add a person"
 * (POST /clients/:id/members), role and status (PATCH /members/:id), and
 * "Resend invite" / "Send reset link" (POST /members/:id/invite).
 */

export const MEMBER_ROLES = ["owner", "admin", "member"] as const;
export const MEMBER_STATUSES = ["active", "invited", "disabled"] as const;

const ROLE_LABELS: Record<MemberRole, string> = { owner: "owner", admin: "admin", member: "member" };

export type ApiMember = {
  id: string;
  clientId: string;
  email: string;
  name: string | null;
  title: string | null;
  role: MemberRole;
  status: MemberStatus;
  invitedAt: string | null;
  joinedAt: string | null;
  lastSeenAt: string | null;
};

export function memberView(row: ClientMember): ApiMember {
  return {
    id: row.id,
    clientId: row.client_id,
    email: row.email,
    name: row.name,
    title: row.title,
    role: row.role,
    status: row.status,
    invitedAt: instant(row.invited_at),
    joinedAt: instant(row.accepted_at),
    lastSeenAt: instant(row.last_seen_at),
  };
}

/** A client's portal people, in the order they were added. */
export async function listMemberRows(clientId: string): Promise<ClientMember[]> {
  const { data, error } = await requireDb()
    .from("client_members")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw dbError("client members list", error);
  return (data ?? []) as ClientMember[];
}

const MEMBER_MISSING = "That person";

/** A portal person on a client the caller may see, else 404 "That person no longer exists.". */
export async function findMember(ctx: ApiContext, id: string | undefined): Promise<{ member: ClientMember; client: Client }> {
  if (!isUuid(id)) throw notFound(MEMBER_MISSING);
  const { data, error } = await requireDb().from("client_members").select("*").eq("id", id).maybeSingle();
  if (error) throw dbError("client member lookup", error);
  const member = (data as ClientMember | null) ?? null;
  if (!member) throw notFound(MEMBER_MISSING);
  const client = await findSectionClient(ctx, member.client_id, MEMBER_MISSING);
  return { member, client };
}

/* ------------------------------------------------------------------ */
/* POST /clients/:id/members                                           */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ALREADY = "That person is already on this team.";

const addBody = z.object({
  email: z.string({ error: COPY.email }).trim().toLowerCase().max(200, COPY.email).regex(EMAIL_RE, COPY.email),
  name: zText(200),
  title: zText(120),
  role: z.enum(MEMBER_ROLES, { error: "Pick a role from the list." }).optional(),
});

/** "Add a person": 201 `{ member, invite: "sent" | "failed" }`. The portal invite goes out at once. */
export async function addMember(
  ctx: ApiContext,
  clientId: string | undefined,
  raw: unknown,
): Promise<{ member: ApiMember; invite: "sent" | "failed" }> {
  const client = await findSectionClient(ctx, clientId);
  const body = parseBody(addBody, raw, { email: "email" });

  const { data: existing, error } = await requireDb()
    .from("client_members")
    .select("id")
    .eq("client_id", client.id)
    .ilike("email", exactIlike(body.email))
    .limit(1);
  if (error) throw dbError("client member duplicate check", error);
  if ((existing ?? []).length) throw conflict("member_exists", ALREADY, { email: ALREADY });

  const { member, invite } = await inviteMember({
    client_id: client.id,
    email: body.email,
    name: body.name ?? null,
    title: body.title ?? null,
    role: body.role ?? "member",
    invited_by: ctx.email,
    actor_type: "admin",
  });
  return { member: memberView(member), invite: invite.ok ? "sent" : "failed" };
}

/* ------------------------------------------------------------------ */
/* PATCH /members/:id                                                  */
/* ------------------------------------------------------------------ */

const patchBody = z.object({
  role: z.enum(MEMBER_ROLES, { error: "Pick a role from the list." }).optional(),
  status: z.enum(MEMBER_STATUSES, { error: COPY.status }).optional(),
});

/**
 * Role and status. Turning a person back on makes them `active` when they
 * have signed in before, else `invited` again.
 */
export async function updateMember(ctx: ApiContext, id: string | undefined, raw: unknown): Promise<ApiMember> {
  const { member, client } = await findMember(ctx, id);
  const body = parseBody(patchBody, raw);

  const patch: Partial<ClientMember> = {};
  const changes: string[] = [];
  if (body.role && body.role !== member.role) {
    patch.role = body.role;
    changes.push(`role ${ROLE_LABELS[body.role]}`);
  }
  if (body.status) {
    const next: MemberStatus = body.status === "disabled" ? "disabled" : member.accepted_at ? "active" : "invited";
    if (next !== member.status) {
      patch.status = next;
      changes.push(next === "disabled" ? "disabled" : "turned back on");
    }
  }
  if (changes.length === 0) return memberView(member);

  const saved = await saveMember(member.id, patch);
  await logActivity({
    client_id: client.id,
    actor_type: "admin",
    actor_email: ctx.email,
    event: "member.updated",
    entity_type: "member",
    entity_id: member.id,
    summary: `${member.name ?? member.email}: ${changes.join(", ")}`,
  });
  return memberView(saved);
}

/* ------------------------------------------------------------------ */
/* POST /members/:id/invite                                            */
/* ------------------------------------------------------------------ */

/**
 * "Resend invite" for invited people, "Send reset link" for active ones.
 * Disabled people answer 409 `member_disabled`; a failed email 502 `invite`.
 */
export async function sendLink(ctx: ApiContext, id: string | undefined): Promise<{ member: ApiMember; sent: "invite" | "reset" }> {
  const { member } = await findMember(ctx, id);
  if (member.status === "disabled") throw conflict("member_disabled", "This person is turned off. Turn them back on first.");
  const sent = member.status === "invited" ? "invite" : "reset";
  const result = await sendMemberLink(member, ctx.email, sent);
  if (!result.ok) throw new ApiError(502, "invite", COPY.inviteFailed);
  if (sent === "reset") return { member: memberView(member), sent };
  // A fresh invite: "Invited" on the person's row shows when this one went out.
  // The email has already gone, so a failed stamp is logged, not answered.
  try {
    return { member: memberView(await saveMember(member.id, { invited_at: new Date().toISOString() })), sent };
  } catch (err) {
    console.error("[admin-api] member invite time not saved", member.id, err instanceof Error ? err.message : String(err));
    return { member: memberView(member), sent };
  }
}
