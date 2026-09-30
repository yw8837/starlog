import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config";
import { SITEMAP_PATHS } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_PATHS.map((path) => ({ url: new URL(path, SITE.url).toString() }));
}
