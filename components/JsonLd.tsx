type JsonLdProps = {
  data: Record<string, unknown> | Record<string, unknown>[];
};

/**
 * "<" is written as \u003c. JSON.stringify leaves it alone, so a blog title or
 * FAQ answer from the database containing "</script>" would otherwise close
 * this tag early, break the markup and inject whatever followed.
 */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
