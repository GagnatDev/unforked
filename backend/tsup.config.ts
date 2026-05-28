import { defineConfig } from "tsup";

// Single bundled ESM artifact for the production runtime image: no node_modules
// needed at runtime. `pino-pretty` is dev-only (prod logs plain JSON) and
// `pg-native` is an optional peer of `pg` we never install, so both are
// externalized to keep esbuild from trying to bundle them.
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node24",
  platform: "node",
  bundle: true,
  splitting: false,
  clean: true,
  sourcemap: true,
  // Inline every dependency so the runtime image needs no node_modules. `external`
  // wins over `noExternal`, so pg-native (optional, never installed) and
  // pino-pretty (dev-only; its worker-thread transport doesn't survive bundling)
  // stay out.
  noExternal: [/.*/],
  external: ["pg-native", "pino-pretty"],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
