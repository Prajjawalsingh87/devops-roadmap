// Builds the GitHub Pages site into _site/ from README.md (the source of truth).
//   node site/build.mjs            -> _site/ (index.html, assets, roadmap.json, PDFs)
// No dependencies: the README format is simple Markdown, parsed with a few regexes.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "_site");
const REPO = "https://github.com/Prajjawalsingh87/devops-roadmap";

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const plain = (md) => md.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "").trim();

// Relative links: PDFs are published with the site; folders point to GitHub.
function resolveHref(href) {
  if (/^https?:\/\//.test(href)) return href;
  const path = href.replace(/^\.?\//, "");
  if (path.endsWith(".pdf")) return path;
  return `${REPO}/tree/main/${path}`;
}

// Inline Markdown -> escaped HTML (links, bold, italic, code).
function inline(md) {
  let html = escapeHtml(md);
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    const url = resolveHref(href.replace(/&amp;/g, "&"));
    const external = /^https?:/.test(url) ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${escapeHtml(url)}"${external}>${text}</a>`;
  });
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return html;
}

const readme = readFileSync(join(ROOT, "README.md"), "utf8").replace(/\r\n/g, "\n");
const lines = readme.split("\n");

// Guides table: | # | Topic | [📄 file.pdf](./dir/file.pdf) | Pages | Status |
const guides = [];
for (const line of lines) {
  if (!/^\|\s*\d+\s*\|/.test(line)) continue; // numbered rows of the Guides at a Glance table
  const m = line.match(/^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*\[[^\]]*\]\(([^)]+\.pdf)\)\s*\|\s*(\d+)?\s*\|\s*(.+?)\s*\|$/);
  if (!m) throw new Error(`Can't read guide row (expected | # | Topic | [file](./dir/file.pdf) | Pages | Status |): ${line}`);
  guides.push({ title: plain(m[1]), pdf: resolveHref(m[2]), folder: m[2].replace(/^\.?\//, "").split("/")[0], pages: m[3] ? Number(m[3]) : null, status: plain(m[4]) });
}

// "## ✅ Guide: NAME" sections: collect the cells of their "Covered" table.
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^## .*Guide:\s*(.+)$/);
  if (!m) continue;
  const covered = [];
  for (let j = i + 1; j < lines.length && !lines[j].startsWith("## "); j++) {
    if (!lines[j].startsWith("|") || /^\|[\s|:-]+\|$/.test(lines[j])) continue;
    for (const cell of lines[j].split("|").slice(1, -1).map((c) => plain(c))) if (cell && cell !== "Covered") covered.push(cell);
  }
  const guide = guides.find((g) => g.title.toLowerCase().startsWith(m[1].trim().toLowerCase()));
  if (guide) guide.covered = covered;
}

// Roadmap: "### Phase N — Title" followed by "- [ ]" / "- [x]" items.
const phases = [];
const seen = new Set();
for (const line of lines) {
  // The roadmap ends at the next "## " section after the phases.
  if (phases.length && /^##\s/.test(line)) break;
  const heading = line.match(/^###\s+(Phase\s+\d+)\s*[—–-]\s*(.+)$/);
  if (heading) {
    phases.push({ id: slug(heading[1]), label: heading[1], title: heading[2].trim(), topics: [] });
    continue;
  }
  const item = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.+)$/);
  if (!item || !phases.length) continue;
  const md = item[2].trim();
  const title = plain(md).split(/\s+[—–-]\s+|\s+\(/)[0].trim();
  let id = slug(title);
  while (seen.has(id)) id += "-2";
  seen.add(id);
  const folder = (md.match(/\]\(\.\/([^)/]+)\)/) || [])[1];
  const guide = guides.find((g) => g.folder === folder);
  phases.at(-1).topics.push({ id, title, html: inline(md), done: item[1].toLowerCase() === "x", guide: guide ? guide.pdf : null });
}

if (!phases.length) throw new Error("No '### Phase N — Title' sections found in README.md");
for (const p of phases) if (!p.topics.length) throw new Error(`${p.label} has no checklist items`);

const tagline = plain((readme.match(/^\*\*(.+?)\*\*$/m) || [, ""])[1]);
const data = { repo: REPO, tagline, generatedFrom: "README.md", phases, guides };

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const file of ["index.html", "styles.css", "app.js", "favicon.svg"]) cpSync(join(ROOT, "site", file), join(OUT, file));
writeFileSync(join(OUT, "roadmap.json"), JSON.stringify(data, null, 2));
writeFileSync(join(OUT, ".nojekyll"), "");

// Publish every PDF under the repo so guide links work on the site.
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  if (name.startsWith(".") || name === "_site" || name === "site" || name === "node_modules") return [];
  return statSync(full).isDirectory() ? walk(full) : name.endsWith(".pdf") ? [full] : [];
});
for (const pdf of walk(ROOT)) {
  const dest = join(OUT, relative(ROOT, pdf));
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(pdf, dest);
}
for (const g of guides) if (!existsSync(join(OUT, g.pdf))) throw new Error(`Guide PDF missing: ${g.pdf}`);

const total = phases.reduce((n, p) => n + p.topics.length, 0);
console.log(`Built _site/: ${phases.length} phases, ${total} topics, ${guides.length} guides`);
