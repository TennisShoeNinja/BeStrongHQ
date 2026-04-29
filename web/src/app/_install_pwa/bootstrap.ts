


const DISMISSED_KEY = "bestrong:install-chip:dismissed";
const MOUNT_ID = "bestrong-install-chip-root";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "prompt" | "safari";
type Platform = "macos" | "ios" | "other";

function detectSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  
  return /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone);
}

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Macintosh/.test(ua)) return "macos";
  return "other";
}

function isDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    
  }
}

let deferred: BeforeInstallPromptEvent | null = null;
let chipEl: HTMLElement | null = null;

function buildChip(mode: Mode): HTMLElement {
  const host = document.createElement("div");
  host.id = MOUNT_ID;

  const chip = document.createElement("div");
  chip.setAttribute(
    "style",
    [
      "position:fixed",
      "top:16px",
      "right:16px",
      "z-index:60",
      "display:flex",
      "align-items:center",
      "gap:4px",
      "padding:6px 6px 6px 12px",
      "border-radius:999px",
      "background-color:var(--cloud-surface-raised,#0f0f12)",
      "border:1px solid var(--cloud-border-strong,rgba(255,255,255,0.12))",
      "box-shadow:0 6px 20px rgba(0,0,0,0.35)",
      "font-size:13px",
      "color:var(--cloud-text,#fafafa)",
      "font-family:var(--font-sans),system-ui,sans-serif",
    ].join(";"),
  );

  const action = document.createElement("button");
  action.type = "button";
  action.setAttribute(
    "style",
    [
      "background:transparent",
      "border:none",
      "color:inherit",
      "font:inherit",
      "cursor:pointer",
      "padding:4px 8px",
      "display:inline-flex",
      "align-items:center",
      "gap:8px",
    ].join(";"),
  );
  action.innerHTML =
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>` +
    `<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>` +
    `<span>Install app</span>`;
  action.addEventListener("click", () => {
    void onAction(mode);
  });

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "Dismiss install prompt");
  dismiss.setAttribute(
    "style",
    [
      "background:transparent",
      "border:none",
      "color:var(--cloud-text-muted,rgba(250,250,250,0.6))",
      "cursor:pointer",
      "padding:4px",
      "border-radius:999px",
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "line-height:0",
    ].join(";"),
  );
  dismiss.innerHTML =
    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>` +
    `<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>` +
    `</svg>`;
  dismiss.addEventListener("click", () => {
    markDismissed();
    removeChip();
  });

  chip.appendChild(action);
  chip.appendChild(dismiss);
  host.appendChild(chip);
  return host;
}

function removeChip(): void {
  if (chipEl && chipEl.parentNode) {
    chipEl.parentNode.removeChild(chipEl);
  }
  chipEl = null;
}

function showChip(mode: Mode): void {
  if (chipEl) return;
  if (isStandalone() || isDismissed()) return;
  if (!document.body) return;
  chipEl = buildChip(mode);
  document.body.appendChild(chipEl);
}

async function onAction(mode: Mode): Promise<void> {
  if (mode === "safari") {
    showSafariModal();
    return;
  }
  if (!deferred) return;
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      removeChip();
    }
  } catch {
    
  }
  deferred = null;
}

function showSafariModal(): void {
  const platform = detectPlatform();

  const overlay = document.createElement("div");
  overlay.setAttribute(
    "style",
    [
      "position:fixed",
      "inset:0",
      "z-index:70",
      "background-color:rgba(0,0,0,0.6)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "padding:16px",
    ].join(";"),
  );

  const card = document.createElement("div");
  card.setAttribute(
    "style",
    [
      "max-width:420px",
      "width:100%",
      "padding:24px",
      "border-radius:14px",
      "background-color:var(--cloud-surface,#09090b)",
      "border:1px solid var(--cloud-border-strong,rgba(255,255,255,0.12))",
      "color:var(--cloud-text,#fafafa)",
      "font-family:var(--font-sans),system-ui,sans-serif",
      "box-shadow:0 24px 60px rgba(0,0,0,0.55)",
    ].join(";"),
  );
  card.addEventListener("click", (e) => e.stopPropagation());

  const heading = document.createElement("h2");
  heading.textContent = "Install on Safari";
  heading.setAttribute(
    "style",
    "font-size:17px;font-weight:600;margin:0 0 12px 0;",
  );

  const body = document.createElement("div");
  body.setAttribute(
    "style",
    "font-size:14px;line-height:1.6;color:var(--cloud-text-muted,rgba(250,250,250,0.6));",
  );
  if (platform === "macos") {
    body.innerHTML =
      `<ol style="padding-left:18px;margin:0;">` +
      `<li>Open the File menu in Safari.</li>` +
      `<li>Choose <strong style="color:var(--cloud-text)">Add to Dock&hellip;</strong></li>` +
      `<li>Confirm the name and click Add.</li>` +
      `</ol>`;
  } else if (platform === "ios") {
    body.innerHTML =
      `<ol style="padding-left:18px;margin:0;">` +
      `<li>Tap the Share button at the bottom of Safari.</li>` +
      `<li>Scroll and pick <strong style="color:var(--cloud-text)">Add to Home Screen</strong>.</li>` +
      `<li>Confirm the name and tap Add.</li>` +
      `</ol>`;
  } else {
    body.innerHTML =
      `<p style="margin:0;">Open this site in Safari on macOS or iOS, then use the Share or File menu to add it to your Dock or Home Screen.</p>`;
  }

  const footer = document.createElement("div");
  footer.setAttribute("style", "margin-top:20px;text-align:right;");

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Got it";
  close.setAttribute(
    "style",
    [
      "padding:8px 14px",
      "border-radius:8px",
      "border:1px solid var(--cloud-border-strong,rgba(255,255,255,0.12))",
      "background-color:var(--cloud-surface-raised,#0f0f12)",
      "color:var(--cloud-text,#fafafa)",
      "font-size:13px",
      "font-family:inherit",
      "cursor:pointer",
    ].join(";"),
  );

  const dismiss = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") dismiss();
  };

  close.addEventListener("click", dismiss);
  overlay.addEventListener("click", dismiss);
  document.addEventListener("keydown", onKey);

  footer.appendChild(close);
  card.appendChild(heading);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  
  
  if (!window.isSecureContext) return;
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
    
  });
}

function init(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(MOUNT_ID)) return;
  if (isStandalone()) return;

  
  
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    showChip("prompt");
  });

  
  window.addEventListener("appinstalled", () => {
    removeChip();
    deferred = null;
  });

  
  if (detectSafari() && !isDismissed()) {
    showChip("safari");
  }
}

function start(): void {
  registerServiceWorker();
  init();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}
