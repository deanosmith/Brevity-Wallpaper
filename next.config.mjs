import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const swcHelpersRoot = `${projectRoot}/node_modules/@swc/helpers/_`;

/** @type {import("next").NextConfig} */
const nextConfig = {
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      "@swc/helpers/_": swcHelpersRoot,
    },
  },
};

export default nextConfig;
