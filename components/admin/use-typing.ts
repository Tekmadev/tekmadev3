"use client";

import { useEffect, useState } from "react";

/** Input types that do not open the keyboard, so focusing them is not "typing". */
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "range",
  "color",
  "file",
  "hidden",
  "image",
]);

type TypingCandidate = {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
};

/**
 * True when the element takes typed text: a textarea, a select, a
 * contenteditable element, or an input that opens the keyboard.
 */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const node = el as unknown as TypingCandidate;
  const tag = String(node.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = String(node.type ?? "text").toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  if (node.isContentEditable === true) return true;
  const attr = typeof node.getAttribute === "function" ? node.getAttribute("contenteditable") : null;
  return attr === "true" || attr === "";
}

/**
 * True while a text field has focus. The phone tab bar and the lead dock
 * hide while this is true, so the iOS keyboard never covers or floats them.
 * Moving between fields does not flash the bar: focusout waits 100 ms and
 * checks again.
 */
export function useTyping(): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const check = () => setTyping(isTypingTarget(document.activeElement));
    const onFocusIn = (e: FocusEvent) => {
      clear();
      setTyping(isTypingTarget(e.target instanceof Element ? e.target : null));
    };
    const onFocusOut = () => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        check();
      }, 100);
    };
    check();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      clear();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return typing;
}
