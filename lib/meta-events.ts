/**
 * Event ids shared by the browser pixel and the server (Conversions API).
 * Meta counts a browser event and a server event as one conversion when their
 * name and id match, so both sides must build the id the same way.
 */

/** Cal hands the booking uid to the browser and to the webhook, so it needs no passing around. */
export const scheduleEventId = (bookingUid: string) => `schedule:${bookingUid}`;

/** Stripe's checkout session id. Only the server reports a purchase. */
export const purchaseEventId = (sessionId: string) => `purchase:${sessionId}`;
