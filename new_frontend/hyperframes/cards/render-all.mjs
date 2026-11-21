// Renders one looping card video per squad member with HyperFrames.
// Reads src/data/team.ts, writes public/cards/member-<n>.mp4 (consumed by the WebGL carousel).
import { readFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const team = readFileSync(resolve(here, "../../src/data/team.ts"), "utf8");
const outDir = resolve(here, "../../public/cards");
mkdirSync(outDir, { recursive: true });

// Each member object starts with `id: "..."`; split on that and pull the fields we need.
const blocks = team.split(/\n\s*\{\s*\n\s*id:/).slice(1);
const pick = (src, re) => (src.match(re) || [])[1];
const rows = blocks.map((b, index) => ({
  index,
  first: pick(b, /\bname:\s*"([^"\s]+)/),
  role: pick(b, /\brole:\s*"([^"]+)"/),
  power: pick(b, /superpower:\s*\{\s*name:\s*"([^"]+)"/),
  primary: pick(b, /primaryColor:\s*"([^"]+)"/),
  accent: pick(b, /accentColor:\s*"([^"]+)"/),
}));

const only = process.argv[2] !== undefined ? Number(process.argv[2]) : null;
for (const row of rows) {
  if (only !== null && row.index !== only) continue;
  const out = resolve(outDir, `member-${row.index + 1}.mp4`);
  console.log(`▶ rendering ${row.first} → ${out}`);
  execFileSync(
    "npx",
    ["--yes", "hyperframes@0.9.30", "render", "--variables", JSON.stringify(row), "-o", out, "--quality", "looks", "--quiet"],
    { cwd: here, stdio: "inherit" },
  );
}
console.log("✓ done");
