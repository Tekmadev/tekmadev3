import { z } from "zod";

/**
 * The Expo push service (https://docs.expo.dev/push-notifications/sending-notifications/):
 *
 *   POST https://exp.host/--/api/v2/push/send          up to 100 messages, answers one ticket each, in order
 *   POST https://exp.host/--/api/v2/push/getReceipts   up to 1000 ticket ids, answers a receipt per id when ready
 *
 * When "enhanced security for push" is on for the Expo project, every request
 * needs `Authorization: Bearer <access token>`: set EXPO_ACCESS_TOKEN on the
 * server (never in the app). Without it, requests go out unauthenticated, which
 * is what Expo expects when the setting is off.
 *
 * Server only. Nothing here throws past ExpoRequestError, and callers decide
 * what a failure means.
 */

const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

export const MAX_MESSAGES_PER_REQUEST = 100;
export const MAX_RECEIPTS_PER_REQUEST = 1000;
/** Expo's limit for one notification's payload. */
export const MAX_PAYLOAD_BYTES = 4096;

const TIMEOUT_MS = 10_000;

/** One message in the Expo push format (the fields this server sends). */
export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string | null>;
  /** Android: the channel must exist on the phone or nothing is shown. */
  channelId: string;
  /** Android: replaces an entry already shown with the same tag. */
  tag: string;
  /** Coalesces messages still in transit (FCM collapse_key, apns-collapse-id). */
  collapseId?: string;
  priority: "high";
  /** iPhone only (Android sound comes from the channel). */
  sound?: "default";
  /** Seconds the push service keeps trying a phone that is offline. */
  ttl?: number;
  /** iPhone: groups a category's entries. */
  threadId?: string;
};

const zTicket = z.union([
  z.object({ status: z.literal("ok"), id: z.string().min(1) }),
  z.object({
    status: z.literal("error"),
    message: z.string().optional(),
    details: z.object({ error: z.string().optional() }).loose().optional(),
  }),
]);
export type ExpoTicket = z.infer<typeof zTicket>;

const zReceipt = z.union([
  z.object({ status: z.literal("ok") }).loose(),
  z.object({
    status: z.literal("error"),
    message: z.string().optional(),
    details: z.object({ error: z.string().optional() }).loose().optional(),
  }),
]);
export type ExpoReceipt = z.infer<typeof zReceipt>;

const zRequestErrors = z.array(z.object({ code: z.string().optional(), message: z.string().optional() })).optional();

const zSendResponse = z.object({ data: z.array(zTicket).optional(), errors: zRequestErrors });
const zReceiptsResponse = z.object({ data: z.record(z.string(), zReceipt).optional(), errors: zRequestErrors });

/** The whole request failed: network, timeout, a non-2xx answer or request-level errors. */
export class ExpoRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  constructor(message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = "ExpoRequestError";
    this.status = status;
    this.code = code;
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
  const token = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

async function post(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    throw new ExpoRequestError(`request failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

function requestError(status: number, errors: { code?: string; message?: string }[] | undefined): ExpoRequestError {
  const first = errors?.[0];
  return new ExpoRequestError(first?.message ?? `HTTP ${status}`, status, first?.code ?? null);
}

/** The error code of a failed ticket or receipt ("DeviceNotRegistered", ...), or null. */
export function errorCodeOf(result: ExpoTicket | ExpoReceipt): string | null {
  if (result.status !== "error") return null;
  return result.details?.error ?? result.message ?? "unknown";
}

/**
 * Sends up to 100 messages. Returns one ticket per message, in the same order.
 * Throws ExpoRequestError when the request as a whole failed.
 */
export async function sendExpoMessages(messages: readonly ExpoMessage[]): Promise<ExpoTicket[]> {
  if (messages.length === 0) return [];
  if (messages.length > MAX_MESSAGES_PER_REQUEST) throw new ExpoRequestError("too many messages in one request");
  const { status, json } = await post(SEND_URL, messages);
  const parsed = zSendResponse.safeParse(json);
  if (!parsed.success) throw new ExpoRequestError(`unexpected answer (HTTP ${status})`, status);
  const { data, errors } = parsed.data;
  if (status < 200 || status >= 300 || (errors && errors.length > 0) || !data) throw requestError(status, errors);
  if (data.length !== messages.length) throw new ExpoRequestError(`expected ${messages.length} tickets, got ${data.length}`, status);
  return data;
}

/**
 * Receipts for up to 1000 ticket ids. An id missing from the answer has no
 * receipt yet. Throws ExpoRequestError when the request as a whole failed.
 */
export async function getExpoReceipts(ids: readonly string[]): Promise<Record<string, ExpoReceipt>> {
  if (ids.length === 0) return {};
  if (ids.length > MAX_RECEIPTS_PER_REQUEST) throw new ExpoRequestError("too many receipt ids in one request");
  const { status, json } = await post(RECEIPTS_URL, { ids });
  const parsed = zReceiptsResponse.safeParse(json);
  if (!parsed.success) throw new ExpoRequestError(`unexpected answer (HTTP ${status})`, status);
  const { data, errors } = parsed.data;
  if (status < 200 || status >= 300 || (errors && errors.length > 0)) throw requestError(status, errors);
  return data ?? {};
}
