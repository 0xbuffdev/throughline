import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicFiles = [
  "README.md", "AGENTS.md", "CHANGELOG.md", "CONTRIBUTING.md",
  "SECURITY.md", "CODE_OF_CONDUCT.md", "COPYRIGHT.md",
];

function collect(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = join(directory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) collect(path);
    else if (extname(path) === ".md") publicFiles.push(path);
  }
}
collect("docs");
for (const file of [
  ".github/pull_request_template.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
]) publicFiles.push(file);

function checkFences(file, contents) {
  let opening = null;
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const match = /^ {0,3}(~{3,}|`{3,})(.*)$/.exec(line);
    if (!match) continue;
    const token = match[1];
    if (!opening) {
      opening = { marker: token[0], length: token.length, line: index + 1 };
    } else if (token[0] === opening.marker &&
        token.length >= opening.length && match[2].trim() === "") {
      opening = null;
    }
  }
  assert(!opening, file + ": unmatched Markdown code fence starting on line " + opening?.line);
}

let links = 0;
for (const file of publicFiles) {
  const contents = readFileSync(resolve(root, file), "utf8");
  checkFences(file, contents);
  for (const match of contents.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].trim().split(/\s+"/)[0];
    if (!target || target.startsWith("#") ||
        /^(?:https?:|mailto:)/i.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0].split("?")[0]);
    if (!path) continue;
    const absolute = resolve(root, dirname(file), path);
    const scoped = relative(root, absolute);
    assert(scoped !== ".." && !scoped.startsWith(".." + sep),
      file + ": link escapes repository: " + target);
    assert(existsSync(absolute),
      file + ": missing relative link: " + target);
    links++;
  }
}
const rootReadme = readFileSync(resolve(root, "README.md"), "utf8");
for (const phrase of ["schemaVersion: 2", "compileArtifact", "ThroughlineGraphPlayer", "not an npm release"]) {
  assert(rootReadme.includes(phrase), "README missing core contract: " + phrase);
}
console.log("Documentation audit passed: " + publicFiles.length +
  " Markdown files and " + links + " local links.");
