import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config";
import { sitemapEntries } from "@/lib/seo";

/** Every indexable page (lib/seo.ts sitemapEntries), with lastmod where the content carries a date. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries().map(({ path, lastModified, changeFrequency, priority }) => ({
    url: new URL(path, SITE.url).toString(),
    ...(lastModified ? { lastModified } : {}),
    ...(changeFrequency ? { changeFrequency } : {}),
    ...(priority === undefined ? {} : { priority }),
  }));
}
