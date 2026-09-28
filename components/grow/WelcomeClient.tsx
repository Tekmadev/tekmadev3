"use client";

import { useEffect, useState } from "react";
import { LazyBookingEmbed } from "@/components/LazyBookingEmbed";
import { readGrowSession, type GrowSession } from "@/components/grow/session";

/** "You're in, Jane." when the form was filled in this tab, "You're in." otherwise. */
export function WelcomeGreeting() {
  const [first, setFirst] = useState<string | null>(null);
  useEffect(() => {
    const name = readGrowSession()?.name ?? "";
    setFirst(name.split(/\s+/)[0] || null);
  }, []);
  return <>{first ? `You're in, ${first}.` : "You're in."}</>;
}

/**
 * The calendar, pre-filled with what they just typed and carrying their lead
 * id, so the booking lands on the same lead instead of a second one. Cal reads
 * its config once, so the calendar waits until the session has been read.
 */
export function WelcomeBooking() {
  const [session, setSession] = useState<GrowSession | null | undefined>(undefined);
  useEffect(() => {
    setSession(readGrowSession());
  }, []);

  if (session === undefined) {
    return <div className="min-h-[720px] rounded-2xl border border-line-strong bg-surface" aria-hidden />;
  }
  return (
    <LazyBookingEmbed
      prefill={session ? { name: session.name, email: session.email } : undefined}
      metadata={session?.lead ? { lead_ref: session.lead } : undefined}
    />
  );
}
