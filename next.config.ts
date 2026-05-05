import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Global middleware clones request bodies up to this cap so both middleware
   * and route handlers can read them. Apple Health `export.xml` is often
   * 200MB+ — the default 10MB truncates uploads before `/api/nutrition/upload`
   * sees the full stream.
   *
   * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/middlewareClientMaxBodySize
   */
  experimental: {
    middlewareClientMaxBodySize: "512mb",
  },
};

export default nextConfig;
