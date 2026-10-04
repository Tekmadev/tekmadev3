import { z } from "zod";
import { badRequest, MESSAGES } from "@/lib/admin-api";
import { isRealDate } from "./dates";

/**
 * Body checks for the clients domain. The contract's 400s carry one toast
 * (`code` and `message` of the first problem) plus an inline message per bad
 * field, and several fields share a toast that differs from their inline copy
 * (`required` "Business name and a valid email are required." with "Enter a
 * valid email." under the field). The route parses the body as a JSON object
 * with zod; this collector then checks each field with zod and gathers every
 * problem before throwing one 400.
 */

export const INPUT = MESSAGES.invalid; // "Check the highlighted fields."
export const LINK = "Enter a full link starting with https://.";
export const EMAIL = "Enter a valid email.";

/** Any JSON object. Field rules live in FieldCheck so every bad field is reported at once. */
export const jsonObject = z.record(z.string(), z.unknown(), { error: INPUT });
export type JsonObject = z.output<typeof jsonObject>;

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

const zEmail = z.email();
const zUrl = z.string().regex(/^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i);
const zInstant = z.string().regex(INSTANT_RE).refine((v) => !Number.isNaN(Date.parse(v)));
const zDate = z.string().refine(isRealDate);

export const isEmail = (value: string): boolean => zEmail.safeParse(value).success;
export const isUrl = (value: string): boolean => zUrl.safeParse(value).success;

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const has = (body: JsonObject, key: string) => Object.prototype.hasOwnProperty.call(body, key) && body[key] !== undefined;

export class FieldCheck {
  readonly fields: Record<string, string> = {};
  private first: { code: string; message: string } | null = null;

  constructor(private readonly body: JsonObject) {}

  /** Records a problem: `code` and `message` become the toast if it is the first one. */
  add(field: string, code: string, message: string, inline: string = message): void {
    if (!(field in this.fields)) this.fields[field] = inline;
    if (!this.first) this.first = { code, message };
  }

  get failed(): boolean {
    return this.first !== null;
  }

  /** Throws the 400 when anything was recorded. */
  done(): void {
    if (this.first) throw badRequest(this.first.code, this.first.message, this.fields);
  }

  has(key: string): boolean {
    return has(this.body, key);
  }

  /** A required trimmed string: undefined (and a problem) when missing or blank. */
  required(key: string, code: string, message: string, inline: string = message, max = 200): string | undefined {
    const parsed = z.string().safeParse(this.body[key]);
    const value = parsed.success ? parsed.data.trim() : "";
    if (!value) {
      this.add(key, code, message, inline);
      return undefined;
    }
    if (value.length > max) {
      this.add(key, code, message, `Keep it under ${max} characters.`);
      return undefined;
    }
    return value;
  }

  /** Optional nullable text: undefined when absent, null to clear (blank clears too), trimmed otherwise. */
  text(key: string, max = 2000): string | null | undefined {
    if (!has(this.body, key)) return undefined;
    const raw = this.body[key];
    if (raw === null) return null;
    const parsed = z.string().safeParse(raw);
    if (!parsed.success) {
      this.add(key, "input", INPUT, "Send text.");
      return undefined;
    }
    const trimmed = parsed.data.trim();
    if (trimmed.length > max) {
      this.add(key, "input", INPUT, `Keep it under ${max} characters.`);
      return undefined;
    }
    return trimmed === "" ? null : trimmed;
  }

  /** Optional enum: undefined when absent; null only when `nullable`. */
  oneOf<T extends string>(key: string, values: readonly T[], inline: string, nullable = false): T | null | undefined {
    if (!has(this.body, key)) return undefined;
    if (this.body[key] === null && nullable) return null;
    const parsed = z.enum(values as readonly [T, ...T[]]).safeParse(this.body[key]);
    if (parsed.success) return parsed.data as T;
    this.add(key, "input", INPUT, inline);
    return undefined;
  }

  flag(key: string): boolean | undefined {
    if (!has(this.body, key)) return undefined;
    const parsed = z.boolean().safeParse(this.body[key]);
    if (parsed.success) return parsed.data;
    this.add(key, "input", INPUT, "Send true or false.");
    return undefined;
  }

  /** Optional (nullable) whole number within a range. */
  int(key: string, min: number, max: number, inline: string, nullable = false): number | null | undefined {
    if (!has(this.body, key)) return undefined;
    if (this.body[key] === null && nullable) return null;
    const parsed = z.number().int().min(min).max(max).safeParse(this.body[key]);
    if (parsed.success) return parsed.data;
    this.add(key, "input", INPUT, inline);
    return undefined;
  }

  /** Optional nullable calendar date (`YYYY-MM-DD`). */
  date(key: string): string | null | undefined {
    if (!has(this.body, key)) return undefined;
    if (this.body[key] === null) return null;
    const parsed = zDate.safeParse(this.body[key]);
    if (parsed.success) return parsed.data;
    this.add(key, "input", INPUT, "Enter a date as YYYY-MM-DD.");
    return undefined;
  }

  /** Optional nullable ISO 8601 instant with an offset. */
  instant(key: string): string | null | undefined {
    if (!has(this.body, key)) return undefined;
    if (this.body[key] === null) return null;
    const parsed = zInstant.safeParse(this.body[key]);
    if (parsed.success) return parsed.data;
    this.add(key, "input", INPUT, "Enter a valid date and time.");
    return undefined;
  }

  /** Optional nullable http(s) link (400 `url` "Enter a full link starting with https://."). */
  url(key: string, max = 2048): string | null | undefined {
    const value = this.text(key, max);
    if (value && !isUrl(value)) {
      this.add(key, "url", LINK);
      return undefined;
    }
    return value;
  }

  /** Optional nullable email, lowercased. */
  email(key: string, max = 200): string | null | undefined {
    const value = this.text(key, max);
    if (value && !isEmail(value)) {
      this.add(key, "input", INPUT, EMAIL);
      return undefined;
    }
    return value ? value.toLowerCase() : value;
  }
}
