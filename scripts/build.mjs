import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await cp("public", "dist/public", { recursive: true });

await Promise.all([
  mkdir("dist/local", { recursive: true }),
  mkdir("dist/lambda", { recursive: true }),
]);

await Promise.all([
  build({
    entryPoints: ["src/local/server.ts"],
    outfile: "dist/local/server.mjs",
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    sourcemap: true,
    legalComments: "none",
  }),
  build({
    entryPoints: ["src/aws/lambda.ts"],
    outfile: "dist/lambda/index.cjs",
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    sourcemap: true,
    legalComments: "none",
    minify: false,
  }),
  build({
    entryPoints: ["public/app.js"],
    outfile: "dist/public/app.js",
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    legalComments: "none",
  }),
]);

const require = createRequire(import.meta.url);
const lambdaArtifact = require("../dist/lambda/index.cjs");
if (typeof lambdaArtifact.handler !== "function") {
  throw new Error("The built Lambda artifact does not export handler.");
}

process.stdout.write("Build artifacts created; Lambda handler load check passed.\n");
