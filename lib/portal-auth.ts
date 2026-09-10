import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getMembershipsForUser,
  touchMemberSeen,
  type Client,
  type ClientMember,
  type MemberRole,
  type MembershipWithClient,
} from "@/lib/clients-data";

/**
 * Client portal auth. Same Supabase Auth as the admin, but the gate is a
 * membership row in `client_members`, never the admin allowlist. A person
 * with memberships on several clients picks one; the choice is remembered in
 * a cookie scoped to the portal host.
 */

export type PortalSession = {
  user: User;
  email: string;
  member: ClientMember;
  client: Client;
  memberships: MembershipWithClient[];
};

const ACTIVE_CLIENT_COOKIE = "tm_client";

/** Cached per request so the layout and the page share one lookup. */
export const getPortalSession = cache(async function getPortalSession(): Promise<PortalSession | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const memberships = await getMembershipsForUser(user.id, user.email);
  if (memberships.length === 0) return null;

  const store = await cookies();
  const preferred = store.get(ACTIVE_CLIENT_COOKIE)?.value;
  const active = memberships.find((m) => m.client_id === preferred) ?? memberships[0];
  const { client, ...member } = active;

  return { user, email: (user.email || member.email).toLowerCase(), member, client, memberships };
});

/** Returns the signed-in client session or redirects to the portal login. */
export async function requireClient(): Promise<PortalSession> {
  const session = await getPortalSession();
  if (!session) redirect("/login");
  // Fire and forget; never block a page on this.
  void touchMemberSeen(session.member.id).catch(() => {});
  return session;
}

const ROLE_RANK: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

export function hasRole(session: PortalSession, minimum: MemberRole): boolean {
  return ROLE_RANK[session.member.role] >= ROLE_RANK[minimum];
}

export async function requireClientRole(minimum: MemberRole): Promise<PortalSession> {
  const session = await requireClient();
  if (!hasRole(session, minimum)) redirect("/?e=forbidden");
  return session;
}

export async function setActiveClientCookie(clientId: string): Promise<void> {
  const store = await cookies();
  store.set(ACTIVE_CLIENT_COOKIE, clientId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}
