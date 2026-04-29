"use client";

import { useState } from "react";
import {
  HelpCircle,
  Bug,
  MessageSquare,
  ExternalLink,
  ListChecks,
  BookOpen,
  ImagePlus,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-provider";
import apiClient from "@/lib/api";

const REPO_URL = "https://github.com/TennisShoeNinja/BeStrongHQ";

type FeedbackType = "bug" | "feedback" | "question";

export function FeedbackDialog() {
  const { deploymentMode, tenant } = useAuth();
  const [open, setOpen] = useState(false);

  
  
  
  const useInAppForm = deploymentMode === "cloud" && tenant?.subdomain !== "demo";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className="cloud-icon-btn"
        title="Send feedback"
        aria-label="Send feedback"
      >
        <HelpCircle className="w-4 h-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Got feedback?</DialogTitle>
        {useInAppForm ? (
          <CloudFeedbackForm onDone={() => setOpen(false)} />
        ) : (
          <SelfHostedBody />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SelfHostedBody() {
  return (
    <>
      <DialogDescription>
        BeStrong HQ is open source and shaped by coaches like you. File a bug
        or share an idea on GitHub.
      </DialogDescription>
      <div className="flex flex-col gap-2 mt-1">
        <GithubLink
          href={`${REPO_URL}/issues/new?template=bug_report.yml`}
          icon={Bug}
          label="Report a bug"
        />
        <GithubLink
          href={`${REPO_URL}/issues/new?template=feedback.yml`}
          icon={MessageSquare}
          label="Share feedback or an idea"
        />
      </div>
      <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-border/50">
        <SmallLink
          href={`${REPO_URL}/issues`}
          icon={ListChecks}
          label="Browse existing issues"
        />
        <SmallLink
          href={`${REPO_URL}/blob/main/CONTRIBUTING.md`}
          icon={BookOpen}
          label="Contributing guide"
        />
      </div>
    </>
  );
}

function GithubLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="cloud-btn cloud-btn-ghost w-full justify-start"
    >
      <Icon className="w-4 h-4" />
      <span className="flex-1 text-left">{label}</span>
      <ExternalLink className="w-3 h-3 opacity-60" />
    </a>
  );
}

function SmallLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs cloud-text-muted hover:cloud-text-hover"
    >
      <Icon className="w-3 h-3" />
      {label}
    </a>
  );
}

function CloudFeedbackForm({ onDone }: { onDone: () => void }) {
  const [type, setType] = useState<FeedbackType>("feedback");
  const [text, setText] = useState("");
  const [creditName, setCreditName] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = text.trim().length >= 5 && !submitting;

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const accepted: File[] = [];
    for (const f of files) {
      if (!f.type.startsWith("image/")) {
        setError("Only image files are supported.");
        return;
      }
      if (f.size > 5 * 1024 * 1024) {
        setError("Each image must be under 5MB.");
        return;
      }
      accepted.push(f);
      if (accepted.length === 2) break;
    }
    setImages(accepted);
    setError(null);
  }

  function removeImage(idx: number) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const compressed = await Promise.all(images.map((f) => compressImage(f)));
      await apiClient.submitFeedback({
        type,
        text: text.trim(),
        creditName: creditName.trim(),
        pageUrl: window.location.href,
        images: compressed,
      });
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong. Try again?";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogDescription>
        Tell us what&apos;s on your mind. This opens an issue on our tracker so
        we can act on it.
      </DialogDescription>
      <div className="flex flex-col gap-3 mt-1">
        <label className="flex flex-col gap-1 text-xs cloud-text-muted">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FeedbackType)}
            className="cloud-input"
          >
            <option value="bug">Bug report</option>
            <option value="feedback">Feedback or idea</option>
            <option value="question">Question</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs cloud-text-muted">
          What&apos;s happening?
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={2000}
            className="cloud-input"
            placeholder="A sentence is fine. Details help."
          />
        </label>

        <div className="flex flex-col gap-1 text-xs cloud-text-muted">
          <div className="flex items-center justify-between">
            <span>Screenshots (up to 2, optional)</span>
            {images.length < 2 && (
              <label className="inline-flex items-center gap-1 cursor-pointer hover:cloud-text-hover">
                <ImagePlus className="w-3.5 h-3.5" />
                <span>Add</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFiles}
                  className="hidden"
                />
              </label>
            )}
          </div>
          {images.length > 0 && (
            <ul className="flex flex-col gap-1">
              {images.map((f, i) => (
                <li
                  key={i}
                  className="inline-flex items-center justify-between gap-2 cloud-panel rounded px-2 py-1 text-xs"
                >
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="opacity-60 hover:opacity-100"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="flex flex-col gap-1 text-xs cloud-text-muted">
          Credit name (optional)
          <input
            type="text"
            value={creditName}
            onChange={(e) => setCreditName(e.target.value)}
            className="cloud-input"
            placeholder="Name or handle for ACKNOWLEDGMENTS"
            maxLength={80}
          />
        </label>

        {error && (
          <p className="text-xs" style={{ color: "var(--cloud-danger, #ef4444)" }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-1">
          <button
            type="button"
            className="cloud-btn cloud-btn-ghost"
            onClick={onDone}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="cloud-btn cloud-btn-primary"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            {submitting ? "Sending..." : "Send feedback"}
          </button>
        </div>
      </div>
    </>
  );
}

async function compressImage(
  file: File,
  maxWidth = 1920,
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas not supported in this browser"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error("failed to encode image"));
          else resolve(blob);
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("failed to load image"));
    };
    img.src = url;
  });
}
