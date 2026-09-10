/** robots.txt for the portal host (the proxy rewrites /robots.txt here). */
export function GET() {
  return new Response("User-agent: *\nDisallow: /\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
