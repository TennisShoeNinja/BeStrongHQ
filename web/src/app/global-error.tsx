"use client";

import { AlertTriangle } from "lucide-react";

export default function GlobalError() {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--cloud-surface)" }}
      >
        <div
          className="cloud-panel"
          style={{
            padding: 32,
            maxWidth: 480,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangle
              style={{ width: 22, height: 22, color: "#fca5a5" }}
              strokeWidth={1.8}
            />
          </div>
          <h2
            className="cloud-text"
            style={{
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Something went wrong
          </h2>
          <p
            className="cloud-text-muted"
            style={{ fontSize: 13, lineHeight: 1.5 }}
          >
            An unexpected error occurred. Please refresh the page or try again.
          </p>
        </div>
      </body>
    </html>
  );
}
