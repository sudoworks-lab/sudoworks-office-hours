import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const ROOTS = ["src", "infra", "scripts", "test", "public"];
const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".mjs", ".svg", ".ts"]);
const failures: string[] = [];

async function inspect(path: string): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      await inspect(child);
      continue;
    }
    if (!TEXT_EXTENSIONS.has(extname(entry.name))) continue;
    const content = await readFile(child, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      if (/\s+$/u.test(line)) failures.push(`${child}:${index + 1} trailing whitespace`);
    });
    if (!content.endsWith("\n")) failures.push(`${child}: missing final newline`);
    if (child.startsWith("src/") && /console\.(?:log|error|warn)/u.test(content)) {
      failures.push(`${child}: use the structured Logger instead of console`);
    }
  }
}

for (const root of ROOTS) await inspect(root);
if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Repository text checks passed.\n");
}
