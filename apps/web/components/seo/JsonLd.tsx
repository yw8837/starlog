import { jsonLdScript, organizationJsonLd, websiteJsonLd } from "@/lib/jsonld";

/** One schema.org node as a JSON-LD script; renders nothing for null (a page without that node). */
export function JsonLd({ data }: { data: object | null | undefined }) {
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />;
}

/** The publisher (열매스튜디오) and the site's name (스타로그 / Starlog), on every page from the root layout. */
export function SiteJsonLd() {
  return (
    <>
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />
    </>
  );
}
