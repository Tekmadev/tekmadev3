/** The portal has no sitemap. Returns 404 so crawlers stop asking. */
export function GET() {
  return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
}
