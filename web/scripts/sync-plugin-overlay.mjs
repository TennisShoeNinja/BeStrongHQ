


import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(__filename), "..");
const repoRoot = path.resolve(webRoot, "..");
const appRoot = path.join(webRoot, "src", "app");
const srcRoot = path.join(webRoot, "src");
const configRoot = path.join(webRoot, "src", "config");

const PLUGIN_PACKAGE = process.env.PLUGIN_PACKAGE_NAME || "bestrong_cloud";
const PLUGIN_BUNDLE_DIR = process.env.PLUGIN_BUNDLE_DIR || "cloud_pkg";


const MANIFEST_PATH = path.join(
  webRoot,
  "node_modules",
  ".cache",
  "plugin-overlay-manifest.json"
);

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return { targets: [] };
  }
}

function writeManifest(targets) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ targets }, null, 2));
}

function isTrackedInGit(absPath) {
  const rel = path.relative(repoRoot, absPath);
  if (rel.startsWith("..")) return false;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", rel], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function isDirtyInGit(absPath) {
  const rel = path.relative(repoRoot, absPath);
  if (rel.startsWith("..")) return false;
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--", rel], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

function restoreFromGit(absPath) {
  const rel = path.relative(repoRoot, absPath);
  try {
    execFileSync("git", ["checkout", "HEAD", "--", rel], {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function deleteTarget(target) {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {

  }
}

// Reconcile a stale manifest target that the new overlay no longer provides.
// - If the file is tracked in git, restore the public stub instead of deleting.
//   Skip restore when the user has uncommitted edits, so we don't trample work.
// - Otherwise it's a generated overlay artifact, safe to remove.
function reconcileObsolete(target) {
  if (isTrackedInGit(target)) {
    if (isDirtyInGit(target)) return;
    restoreFromGit(target);
    return;
  }
  deleteTarget(target);
}

function tryResolvePluginRoot() {
  const bundled = path.resolve(webRoot, "..", PLUGIN_BUNDLE_DIR, PLUGIN_PACKAGE);
  if (fs.existsSync(bundled)) {
    return bundled;
  }

  for (const pythonCmd of ["python3", "python"]) {
    try {
      const result = execFileSync(
        pythonCmd,
        [
          "-c",
          [
            "import inspect",
            "import pathlib",
            `import ${PLUGIN_PACKAGE}`,
            `print(pathlib.Path(inspect.getfile(${PLUGIN_PACKAGE})).resolve().parent)`,
          ].join("; "),
        ],
        {
          cwd: webRoot,
          encoding: "utf8",
          // Discard the child's stderr so the Microsoft Store python.exe
          // stub message ("Python was not found...") and ModuleNotFoundError
          // text don't leak into the user's terminal during npm run build.
          // The catch below already handles the failure silently; we just
          // need to keep the stderr noise from reaching the console.
          stdio: ["ignore", "pipe", "ignore"],
        }
      ).trim();

      if (result) return result;
    } catch {

    }
  }
  return null;
}


function staticMappings() {
  return [
    {
      source: ["web_overlay", "sentry", "sentry.server.config.ts"],
      target: path.join(webRoot, "sentry.server.config.ts"),
    },
    {
      source: ["web_overlay", "sentry", "sentry.edge.config.ts"],
      target: path.join(webRoot, "sentry.edge.config.ts"),
    },
    {
      source: ["web_overlay", "sentry", "instrumentation.ts"],
      target: path.join(srcRoot, "instrumentation.ts"),
    },
    {
      source: ["web_overlay", "sentry", "instrumentation-client.ts"],
      target: path.join(srcRoot, "instrumentation-client.ts"),
    },
  ];
}


function discoverAppMappings(pluginRoot) {
  const overlayAppRoot = path.join(pluginRoot, "web_overlay", "app");
  if (!fs.existsSync(overlayAppRoot)) return [];

  const mappings = [];

  function walk(relParts) {
    const overlayDir = path.join(overlayAppRoot, ...relParts);
    for (const entry of fs.readdirSync(overlayDir, { withFileTypes: true })) {
      const nextParts = [...relParts, entry.name];
      const publicPath = path.join(appRoot, ...nextParts);

      if (entry.isDirectory()) {
        if (fs.existsSync(publicPath)) {
          walk(nextParts);
        } else {
          mappings.push({
            source: ["web_overlay", "app", ...nextParts],
            target: publicPath,
          });
        }
      } else if (entry.isFile()) {
        mappings.push({
          source: ["web_overlay", "app", ...nextParts],
          target: publicPath,
        });
      }
    }
  }

  walk([]);
  return mappings;
}


function discoverConfigMappings(pluginRoot) {
  const overlayConfigRoot = path.join(pluginRoot, "web_overlay", "config");
  if (!fs.existsSync(overlayConfigRoot)) return [];

  const mappings = [];
  for (const entry of fs.readdirSync(overlayConfigRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    mappings.push({
      source: ["web_overlay", "config", entry.name],
      target: path.join(configRoot, entry.name),
    });
  }
  return mappings;
}


const prevManifest = readManifest();
const pluginRoot = tryResolvePluginRoot();

const mappings = pluginRoot
  ? [
      ...staticMappings(),
      ...discoverAppMappings(pluginRoot),
      ...discoverConfigMappings(pluginRoot),
    ]
  : [];

const plannedTargets = new Set();
const copyMappings = [];
for (const mapping of mappings) {
  const source = pluginRoot ? path.join(pluginRoot, ...mapping.source) : null;
  if (!source || !fs.existsSync(source)) continue;
  copyMappings.push({ source, target: mapping.target });
  plannedTargets.add(mapping.target);
}

// Reconcile targets the previous run produced that we will not re-produce now.
// This must run before the copy pass so a tracked-stub restore doesn't get
// clobbered by anything (and so we don't fight ourselves).
for (const target of prevManifest.targets) {
  if (plannedTargets.has(target)) continue;
  reconcileObsolete(target);
}

const copiedTargets = [];
for (const { source, target } of copyMappings) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
  copiedTargets.push(target);
}

writeManifest(copiedTargets);
