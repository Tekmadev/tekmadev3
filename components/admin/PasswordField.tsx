"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Password input with a show/hide toggle. Used on the login form and anywhere
 * an admin types a password (profile, team). Keeps the eye button inside the
 * field and styled to the Tekmadev theme.
 */
export function PasswordField({
  name,
  placeholder = "Password",
  autoComplete = "current-password",
  required = false,
  defaultValue,
  id,
  minLength,
}: {
  name: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  id?: string;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        // 16px below lg, in portrait and landscape: iOS zooms on anything smaller.
        className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 pr-11 text-base text-ink outline-none transition-colors focus:border-gold lg:text-sm"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        title={show ? "Hide password" : "Show password"}
        className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-ink-4 transition-colors hover:text-ink"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
