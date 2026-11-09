import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureDependencies, fixtureManifest } from "./integration-dependencies.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const scratch = mkdtempSync(join(tmpdir(), "throughline-lock-update-"));
const emit = process.argv.includes("--emit");

function run(cwd, command, args) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(command + " " + args.join(" ") + " failed:\n" +
      (result.stdout ?? "") + "\n" + (result.stderr ?? "") +
      (result.error ? "\n" + result.error.message : ""));
  }
}

try {
  const tarball = join(scratch, "throughline.tgz");
  run(root, "pnpm", ["pack", "--out", tarball]);
  for (const name of Object.keys(fixtureDependencies)) {
    const dir = join(scratch, name);
    mkdirSync(dir);
    copyFileSync(tarball, join(dir, "throughline.tgz"));
    writeFileSync(join(dir, "package.json"), JSON.stringify(fixtureManifest(name), null, 2) + "\n");
    run(dir, "npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"]);
    const lock = JSON.parse(readFileSync(join(dir, "package-lock.json"), "utf8"));
    // Source changes must not invalidate a consumer lock. Pin all registry
    // dependencies while allowing a freshly packed local Throughline tarball.
    const throughline = lock.packages["node_modules/@0xbuff/throughline"];
    if (!throughline || !String(throughline.resolved).includes("throughline.tgz")) {
      throw new Error("Lockfile lost the local packed Throughline dependency: " + name);
    }
    delete throughline.integrity;
    const data = JSON.stringify(lock, null, 2) + "\n";
    if (emit) {
      console.log("THL_LOCK_START " + name);
      console.log(Buffer.from(data).toString("base64"));
      console.log("THL_LOCK_END " + name);
    } else {
      const path = join(root, "scripts/fixtures/lockfiles");
      mkdirSync(path, { recursive: true });
      writeFileSync(join(path, name + ".json"), data);
      console.log("Updated npm lockfile for " + name);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
