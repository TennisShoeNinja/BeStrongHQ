"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface MobileTopbarAction {
  label: string;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}

interface MobileTopbarProps {
  backHref?: string;
  actions?: MobileTopbarAction[];
  title?: string;
}

/**
 * Detail-page topbar for mobile. Renders only at < md.
 * Pages opt in by rendering this above their content; pair with `md:hidden`
 * on this element if you want to keep the desktop Topbar visible at >= md.
 */
export function MobileTopbar({
  backHref,
  actions = [],
  title,
}: MobileTopbarProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="cloud-mobile-topbar md:hidden">
      <button
        type="button"
        className="cloud-mobile-topbar-btn"
        aria-label="Back"
        onClick={() => (backHref ? router.push(backHref) : router.back())}
      >
        <ArrowLeft className="cloud-mobile-topbar-icon" />
      </button>
      {title && (
        <span
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 14,
            fontWeight: 600,
            color: "var(--cloud-text)",
            letterSpacing: "-0.005em",
            margin: "0 12px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
      )}
      {actions.length > 0 ? (
        <>
          <button
            type="button"
            className="cloud-mobile-topbar-btn"
            aria-label="More actions"
            onClick={() => setMenuOpen(true)}
          >
            <MoreHorizontal className="cloud-mobile-topbar-icon" />
          </button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle>Actions</SheetTitle>
              </SheetHeader>
              <div className="cloud-more-grid">
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    className="cloud-more-item"
                    onClick={() => {
                      action.onClick();
                      setMenuOpen(false);
                    }}
                  >
                    {action.icon && <action.icon className="cloud-more-icon" />}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        // keep spacing balanced when no actions
        <span style={{ width: 38 }} aria-hidden />
      )}
    </header>
  );
}
