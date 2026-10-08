"use client";

import { useEffect, type RefObject } from "react";

/** Add lead's and Edit lead's fields, top to bottom: each field's id is its key. */
const FIELD_ORDER = ["name", "business", "email", "phone", "website", "need", "message"] as const;

/**
 * After a refused save on Add lead or Edit lead, brings what went wrong into
 * view. On a phone the button sits far below the form's top and the form
 * remounts where the person is, so the message would be off screen. The
 * first field with a message is scrolled to the middle and focused (a focus
 * outside a tap does not open the iPhone keyboard); with no field message
 * (the 403, a gone lead, no connection), the notice on top is.
 */
export function useRevealRefusal(
  attempt: number,
  fields: Record<string, string>,
  formRef: RefObject<HTMLFormElement | null>,
  noticeRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (attempt === 0) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const behavior: ScrollBehavior = reduce ? "auto" : "smooth";
    const key = FIELD_ORDER.find((k) => fields[k]);
    const field = key ? formRef.current?.querySelector<HTMLElement>(`#${key}`) : null;
    if (field) {
      field.scrollIntoView({ block: "center", behavior });
      field.focus({ preventScroll: true });
      return;
    }
    noticeRef.current?.scrollIntoView({ block: "center", behavior });
  }, [attempt, fields, formRef, noticeRef]);
}
