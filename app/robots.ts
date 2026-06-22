import type { MetadataRoute } from "next";

// Private app — keep it out of search indexes.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
