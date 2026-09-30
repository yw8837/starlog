import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config";
import { ROBOTS_DISALLOW } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...ROBOTS_DISALLOW] },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
