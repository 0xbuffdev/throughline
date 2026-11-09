import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtures = join(root, "scripts/fixtures/markdown-hosts");
const scratch = mkdtempSync(join(tmpdir(), "throughline-markdown-consumers-"));

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error([command, ...args].join(" ") + " failed:\n" +
      (result.stdout ?? "") + "\n" + (result.stderr ?? "") +
      (result.error ? "\n" + result.error.message : ""));
  }
  return result.stdout;
}

try {
  const tarball = join(scratch, "throughline.tgz");
  run(root, "pnpm", ["pack", "--out", tarball]);

  const consumer = join(scratch, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), JSON.stringify({
    name: "throughline-markdown-consumer", private: true, type: "module",
  }));
  run(consumer, "npm", [
    "install", "--no-audit", "--no-fund", "--no-package-lock",
    tarball, "react@19.3.1", "react-dom@19.3.1",
    "react-markdown@10.1.0", "mdx-bundler@10.1.1",
    "markdown-to-jsx@9.10.6", "esbuild@0.25.12",
  ]);

  for (const host of ["react-markdown", "mdx-bundler", "markdown-to-jsx"]) {
    const name = host + ".mjs";
    copyFileSync(join(fixtures, name), join(consumer, name));
    run(consumer, "node", [name]);
    console.log(host + ": packed consumer passed");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
