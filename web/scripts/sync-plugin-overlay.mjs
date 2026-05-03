


import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const webRoot = path.resolve(path.dirname(__filename), "..");
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

function removeTarget(target) {
  if (!fs.existsSync(target) && !fs.existsSync(target + "")) return;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    
  }
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
        { cwd: webRoot, encoding: "utf8" }
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


for (const target of prevManifest.targets) {
  removeTarget(target);
}

const pluginRoot = tryResolvePluginRoot();

if (!pluginRoot) {
  writeManifest([]);
  process.exit(0);
}

const mappings = [
  ...staticMappings(),
  ...discoverAppMappings(pluginRoot),
  ...discoverConfigMappings(pluginRoot),
];
const copiedTargets = [];

for (const mapping of mappings) {
  const source = path.join(pluginRoot, ...mapping.source);
  if (!fs.existsSync(source)) continue;

  fs.mkdirSync(path.dirname(mapping.target), { recursive: true });
  
  
  fs.cpSync(source, mapping.target, { recursive: true, force: true });
  copiedTargets.push(mapping.target);
}

writeManifest(copiedTargets);
