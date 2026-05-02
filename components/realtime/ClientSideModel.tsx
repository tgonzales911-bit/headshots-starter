"use client";

import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { collectFinalDownloadUrls } from "@/lib/finalDownloadUrls";
import { Database } from "@/types/supabase";
import { headshotRow, imageRow, modelRow, sampleRow } from "@/types/utils";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

export const revalidate = 0;

type ClientSideModelProps = {
  serverModel: modelRow;
  serverImages: imageRow[];
  serverHeadshots: headshotRow[];
  samples: sampleRow[];
  /** Server snapshot from model detail page for Results download URLs. */
  serverDownloadUrls?: string[];
};

type PipelineEvent = {
  id: number;
  created_at: string;
  stage: string;
  event_type: string;
  request_id: string | null;
  message: string | null;
  payload: unknown;
};

function eventTone(eventType: string): string {
  if (eventType.includes("error")) {
    return "bg-red-100 text-red-800 border-red-200";
  }
  if (eventType === "completed") {
    return "bg-green-100 text-green-800 border-green-200";
  }
  if (eventType.includes("submit")) {
    return "bg-blue-100 text-blue-800 border-blue-200";
  }
  if (eventType === "selection") {
    return "bg-amber-100 text-amber-800 border-amber-200";
  }
  return "bg-muted text-foreground border-border";
}

export default function ClientSideModel({
  serverModel,
  serverImages,
  serverHeadshots,
  samples,
  serverDownloadUrls = [],
}: ClientSideModelProps) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  );
  const [model, setModel] = useState<modelRow>(serverModel);
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState<boolean>(true);

  useEffect(() => {
    const channel = supabase
      .channel("realtime-model")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "models" },
        (payload: { new: modelRow }) => {
          setModel(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, model, setModel]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/fal/pipeline-status/${serverModel.id}`);
        if (!response.ok) return;
        const data = (await response.json()) as { events?: PipelineEvent[] };
        if (!active) return;
        setEvents(data.events ?? []);
      } finally {
        if (active) {
          setEventsLoading(false);
        }
      }
    };

    fetchStatus();
    timer = setInterval(fetchStatus, 7000);

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [serverModel.id]);

  const downloadUrls = useMemo(() => {
    const fromLive = collectFinalDownloadUrls(model, serverHeadshots, serverImages);
    if (fromLive.length === 4) return fromLive;
    if (serverDownloadUrls.length === 4) return serverDownloadUrls.slice(0, 4);
    return fromLive;
  }, [model, serverHeadshots, serverImages, serverDownloadUrls]);

  return (
    <div id="train-model-container" className="w-full h-full">
      <div className="flex flex-col w-full mt-4 gap-8">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-0">
          {samples && (
            <div className="flex w-full lg:w-1/2 flex-col gap-2">
              <h2 className="text-xl">Training Data</h2>
              <div className="flex flex-row gap-4 flex-wrap">
                {samples.map((sample) => (
                  <img
                    key={sample.id}
                    src={sample.uri}
                    className="rounded-md w-60 h-60 object-cover"
                  />
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col w-full lg:w-1/2 rounded-md">
            {model.status === "finished" && (
              <div className="flex flex-1 flex-col gap-2">
                <h1 className="text-xl">Results</h1>
                {downloadUrls.length === 4 && (
                  <Button
                    type="button"
                    size="sm"
                    className="w-fit bg-blue-600 text-white hover:bg-blue-500 dark:bg-blue-600 dark:hover:bg-blue-500"
                    onClick={() => {
                      downloadUrls.forEach((url) =>
                        window.open(url, "_blank", "noopener,noreferrer")
                      );
                    }}
                  >
                    Download All 4
                  </Button>
                )}
                {serverHeadshots && serverHeadshots.length > 0 ? (
                  <div className="flex flex-row flex-wrap gap-4">
                    {serverHeadshots.map((image) => (
                      <div key={image.id}>
                        <img
                          src={image.uri}
                          className="rounded-md w-60 object-cover"
                          alt=""
                        />
                      </div>
                    ))}
                  </div>
                ) : serverImages && serverImages.length > 0 ? (
                  <div className="flex flex-row flex-wrap gap-4">
                    {serverImages.map((image) => (
                      <div key={image.id}>
                        <img
                          src={image.uri}
                          className="rounded-md w-60 object-cover"
                          alt=""
                        />
                      </div>
                    ))}
                  </div>
                ) : model.modelId?.startsWith("http") ? (
                  <p className="text-sm text-muted-foreground">
                    Training produced LoRA weights.{" "}
                    <a
                      href={model.modelId}
                      className="text-primary underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download LoRA file
                    </a>
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div className="border rounded-md p-4">
          <h2 className="text-lg font-medium">Pipeline Timeline</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Latest orchestration events for this model.
          </p>
          {eventsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icons.spinner className="h-4 w-4 animate-spin" />
              Loading events...
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="text-xs border rounded-sm p-2 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium">{event.stage}</span>
                    <span
                      className={`px-2 py-0.5 rounded border text-[10px] font-medium ${eventTone(
                        event.event_type
                      )}`}
                    >
                      {event.event_type}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(event.created_at).toLocaleString()}
                    </span>
                  </div>
                  {event.message && (
                    <p className="text-muted-foreground">{event.message}</p>
                  )}
                  {event.request_id && (
                    <div className="flex items-center gap-2">
                      <p className="text-muted-foreground break-all">
                        request_id: {event.request_id}
                      </p>
                      <button
                        type="button"
                        className="text-primary underline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(event.request_id ?? "");
                          } catch (error) {
                            console.error("Could not copy request id", error);
                          }
                        }}
                      >
                        copy
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
