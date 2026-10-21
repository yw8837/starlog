import { jsonLdScript, organizationJsonLd } from "@/lib/jsonld";

/** One schema.org node as a JSON-LD script; renders nothing for null (a page without that node). */
export function JsonLd({ data }: { data: object | null | undefined }) {
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}

/**
 * The publisher (열매스튜디오), on every page from the root layout. The site's name (WebSite) is not here: the app's is
 * on its home (app/page.tsx), the root domain's on the guide pages (app/guide/layout.tsx), so no page names two sites.
 */
export function SiteJsonLd() {
  return <JsonLd data={organizationJsonLd()} />;
}
