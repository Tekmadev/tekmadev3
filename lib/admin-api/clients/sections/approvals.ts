import { z } from "zod";
import { dbError, instant, isUuid, requireDb, type ApiContext } from "@/lib/admin-api";
import { requestClientApproval } from "@/lib/client-sections-data";
import type { ApprovalKind, ClientApproval } from "@/lib/onboarding-data";
import { COPY, FieldErrors, findSectionClient, isCheckViolation, isUrl, loadPeople, parseBody, zText, type People } from "./shared";

/**
 * Approvals: the list in the bundle and "Request approval"
 * (POST /clients/:id/approvals). Versions count per title (case-insensitive):
 * requesting a title that exists makes the next version and supersedes the
 * one still pending.
 */

export const APP_APPROVAL_KINDS = ["website", "landing_page", "copy", "design", "ad_creative", "email", "automation", "other"] as const;
export type AppApprovalKind = (typeof APP_APPROVAL_KINDS)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "changes_requested", "superseded"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** Website kinds the app has no word for read as the nearest app kind. */
const KIND_FROM_DB: Record<ApprovalKind, AppApprovalKind> = {
  website: "website",
  landing_page: "landing_page",
  ad_creative: "ad_creative",
  receptionist_script: "copy",
  follow_up_sequence: "automation",
  social_content: "design",
  copy: "copy",
  design: "design",
  email: "email",
  automation: "automation",
  other: "other",
};

/** Before migration 20261003000040 is applied, the app-only kinds are stored as "other". */
const LEGACY_KIND: Partial<Record<AppApprovalKind, ApprovalKind>> = { copy: "other", design: "other", email: "other", automation: "other" };

export type ApiApproval = {
  id: string;
  clientId: string;
  title: string;
  kind: AppApprovalKind;
  version: number;
  description: string | null;
  previewUrl: string | null;
  taskId: string | null;
  attachment: { label: string; url: string } | null;
  status: ApprovalStatus;
  feedback: string | null;
  requestedAt: string;
  requestedBy: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
};

function firstAttachment(value: unknown): { label: string; url: string } | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    if (item && typeof item === "object") {
      const { label, url } = item as { label?: unknown; url?: unknown };
      if (typeof label === "string" && typeof url === "string") return { label, url };
    }
  }
  return null;
}

export function approvalView(row: ClientApproval, people: People): ApiApproval {
  return {
    id: row.id,
    clientId: row.client_id,
    title: row.title,
    kind: KIND_FROM_DB[row.kind] ?? "other",
    version: row.version,
    description: row.description,
    previewUrl: row.preview_url,
    taskId: row.task_id,
    attachment: firstAttachment(row.attachments),
    status: row.status,
    feedback: row.feedback,
    requestedAt: instant(row.requested_at),
    requestedBy: people.display(row.requested_by),
    decidedAt: instant(row.decided_at),
    decidedBy: people.display(row.decided_by),
  };
}

/** A client's approvals, newest first. */
export async function listApprovalRows(clientId: string): Promise<ClientApproval[]> {
  const { data, error } = await requireDb()
    .from("client_approvals")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw dbError("client approvals list", error);
  return (data ?? []) as ClientApproval[];
}

const requestBody = z.object({
  title: z.string({ error: "Enter a title." }).trim().min(1, "Enter a title.").max(200, "Keep the title under 200 characters."),
  kind: z.enum(APP_APPROVAL_KINDS, { error: "Pick a kind from the list." }).optional(),
  description: zText(4000),
  previewUrl: zText(2048),
  taskId: zText(100),
  // Checked below: { label, url } or null.
  attachment: z.unknown().optional(),
});

const ATTACHMENT = "Add a label and a full https:// link for the attachment.";
const TASK = "That task is not on this client's checklist.";

/** Whether a checklist task belongs to this client (any of its runs). */
async function clientHasTask(clientId: string, taskId: string): Promise<boolean> {
  if (!isUuid(taskId)) return false;
  const { data, error } = await requireDb().from("onboarding_tasks").select("id").eq("id", taskId).eq("client_id", clientId).maybeSingle();
  if (error) throw dbError("approval task lookup", error);
  return Boolean(data);
}

/**
 * POST /clients/:id/approvals: 201 with the new version. The client is
 * notified and the linked checklist task, while still open, waits on them.
 */
export async function requestApproval(ctx: ApiContext, clientId: string | undefined, raw: unknown): Promise<ApiApproval> {
  const client = await findSectionClient(ctx, clientId);
  const body = parseBody(requestBody, raw, { title: "title" });

  const errors = new FieldErrors();
  if (body.previewUrl && !isUrl(body.previewUrl)) errors.add("previewUrl", "url", COPY.link);
  if (body.taskId && !(await clientHasTask(client.id, body.taskId))) errors.add("taskId", "task", TASK);
  let attachment: { label: string; url: string } | null = null;
  if (body.attachment !== undefined && body.attachment !== null) {
    const att = typeof body.attachment === "object" ? (body.attachment as { label?: unknown; url?: unknown }) : {};
    const label = typeof att.label === "string" ? att.label.trim() : "";
    const url = typeof att.url === "string" ? att.url.trim() : "";
    if (!label || label.length > 120 || !isUrl(url) || url.length > 2048) errors.add("attachment", "attachment", ATTACHMENT);
    else attachment = { label, url };
  }
  errors.throwIfAny();

  const kind = body.kind ?? "other";
  const request = (storedKind: ApprovalKind) =>
    requestClientApproval({
      clientId: client.id,
      title: body.title,
      kind: storedKind,
      description: body.description ?? null,
      previewUrl: body.previewUrl ?? null,
      taskId: body.taskId ?? null,
      attachments: attachment ? [attachment] : [],
      by: ctx.email,
      versionBy: "title",
      taskRule: "open",
    });
  let saved: ClientApproval;
  try {
    saved = await request(kind);
  } catch (err) {
    const legacy = LEGACY_KIND[kind];
    if (!legacy || !isCheckViolation(err)) throw err;
    saved = await request(legacy);
  }
  return approvalView(saved, await loadPeople(ctx));
}
