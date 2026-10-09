"use client";

import { useState } from "react";
import { X } from "lucide-react";

const isEnabled = process.env.NEXT_PUBLIC_ANNOUNCEMENT_ENABLED === "true";
const message = process.env.NEXT_PUBLIC_ANNOUNCEMENT_MESSAGE?.trim();

/** Optional notice above the header. Off unless both env values are set. */
export default function AnnouncementBar() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isEnabled || !message || !isVisible) return null;

  return (
    <div
      role="region"
      aria-label="Announcement"
      className="border-b border-navy-600 bg-navy-700 text-steel"
    >
      <div className="container flex items-center gap-2 py-1">
        <p className="flex-1 py-2 text-sm">{message}</p>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-steel-dim hover:text-steel"
          aria-label="Dismiss announcement"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
