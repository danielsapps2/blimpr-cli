import { chmod } from "node:fs/promises";
import { build } from "esbuild";

await build({
  entryPoints: {
    cli: "src/cli.ts",
    "mcp-server": "src/mcp-server.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  packages: "bundle",
});

await chmod("dist/cli.js", 0o755);
