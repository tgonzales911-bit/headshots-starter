"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EXPORT_PRESETS, type ExportPresetKey } from "@/lib/site";
import { ChevronDown, Download } from "lucide-react";
import { useState } from "react";
import { countWord } from "./orderHelpers";

type Props = {
  orderId: number;
  customerName: string;
  /** Final portrait URLs, in delivery order. */
  urls: string[];
};

function downloadHref(orderId: number, preset: ExportPresetKey, index?: number): string {
  const params = new URLSearchParams();
  if (index === undefined) params.set("zip", "1");
  else params.set("index", String(index));
  params.set("preset", preset);
  return `/api/models/${orderId}/download?${params.toString()}`;
}

export default function PortraitGallery({ orderId, customerName, urls }: Props) {
  const [zipPreset, setZipPreset] = useState<ExportPresetKey>("original");
  const total = urls.length;

  return (
    <section aria-labelledby="portraits-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="portraits-heading" className="font-display text-2xl text-foreground">
          Your portraits
        </h2>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
          Sized for print: choose 8 × 10, 5 × 7 or 4 × 5 at 300 dpi. Tap a portrait to open it
          full size.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:p-5">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="zip-size" className="text-sm font-medium text-card-foreground">
            Size for the full set
          </label>
          <select
            id="zip-size"
            value={zipPreset}
            onChange={(e) => setZipPreset(e.target.value as ExportPresetKey)}
            className="h-12 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {EXPORT_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} ({p.note})
              </option>
            ))}
          </select>
        </div>
        <Button asChild className="h-12 px-5 text-base font-semibold">
          <a href={downloadHref(orderId, zipPreset)} download>
            <Download aria-hidden className="h-4 w-4" />
            Download all {countWord(total)} (.zip)
          </a>
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {urls.map((url, i) => (
          <li key={`${url}-${i}`} className="flex flex-col gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-lg border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Portrait ${i + 1} of ${total} for ${customerName}`}
                className="h-auto w-full"
                loading={i < 2 ? "eager" : "lazy"}
              />
              <span className="sr-only">Opens full size in a new tab</span>
            </a>
            <div className="flex items-center justify-between gap-3">
              <p className="text-base text-foreground">
                Portrait {i + 1} of {total}
              </p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="h-11">
                    <Download aria-hidden className="h-4 w-4" />
                    Download
                    <span className="sr-only"> portrait {i + 1}, choose a size</span>
                    <ChevronDown aria-hidden className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Choose a size</DropdownMenuLabel>
                  {EXPORT_PRESETS.map((p) => (
                    <DropdownMenuItem key={p.key} asChild>
                      <a
                        href={downloadHref(orderId, p.key, i)}
                        download
                        className="flex min-h-[44px] cursor-pointer flex-col items-start justify-center gap-0.5"
                      >
                        <span className="text-sm font-semibold">{p.label}</span>
                        <span className="text-xs opacity-80">{p.note}</span>
                      </a>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
