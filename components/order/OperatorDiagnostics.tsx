"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

type PipelineEvent = {
  id: number;
  created_at: string;
  stage: string;
  event_type: string;
  request_id: string | null;
  message: string | null;
};

type Props = {
  modelId: number;
  rawStatus: string;
  candidateUrls: string[];
  loraUrl: string | null;
};

function eventTone(eventType: string): string {
  if (eventType.includes("error")) return "border-destructive bg-destructive/20";
  if (eventType === "completed") return "border-primary bg-primary/15";
  return "border-border bg-muted";
}

/**
 * Operator-only. The server page renders this solely for the admin account;
 * nothing here is ever sent to a customer's browser.
 */
export default function OperatorDiagnostics({ modelId, rawStatus, candidateUrls, loraUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<PipelineEvent[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/fal/pipeline-status/${modelId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { events?: PipelineEvent[] };
        if (active) setEvents(data.events ?? []);
      } catch {
        // diagnostics are best-effort
      }
    };
    void load();
    const timer = setInterval(load, 7000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [modelId, open]);

  return (
    <details
      className="rounded-lg border border-dashed bg-card p-4 text-sm"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex min-h-[44px] cursor-pointer items-center font-semibold text-card-foreground">
        Operator diagnostics
      </summary>
      <div className="mt-3 flex flex-col gap-5">
        <p className="text-muted-foreground">
          Visible to the operator account only. Raw status:{" "}
          <code className="text-foreground">{rawStatus}</code>.{" "}
          <Link href="/admin/ops" className="font-semibold text-primary underline underline-offset-4">
            Open /admin/ops
          </Link>
        </p>

        {loraUrl && (
          <p>
            <a
              href={loraUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-primary underline underline-offset-4"
            >
              Download LoRA file
            </a>
          </p>
        )}

        {candidateUrls.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-card-foreground">
              Candidate previews ({candidateUrls.length})
            </h3>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {candidateUrls.map((url, i) => (
                <li key={`${url}-${i}`}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Candidate ${i + 1}`}
                      className="h-auto w-full rounded-md border"
                      loading="lazy"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-card-foreground">Pipeline timeline</h3>
          {events === null ? (
            <p className="text-muted-foreground">Loading events…</p>
          ) : events.length === 0 ? (
            <p className="text-muted-foreground">No events yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {events.map((event) => (
                <li key={event.id} className="flex flex-col gap-1 rounded-md border p-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-card-foreground">{event.stage}</span>
                    <span className={cn("rounded border px-2 py-0.5 font-medium", eventTone(event.event_type))}>
                      {event.event_type}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                  {event.message && <p className="break-words text-muted-foreground">{event.message}</p>}
                  {event.request_id && (
                    <p className="break-all text-muted-foreground">request_id: {event.request_id}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
