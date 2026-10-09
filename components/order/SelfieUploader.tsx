"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { SELFIE_MAX, SELFIE_MIN, SELFIE_RECOMMENDED } from "@/lib/site";
import { Camera, Check, RotateCw, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  ACCEPTED_PHOTO_LABEL,
  ACCEPTED_PHOTO_TYPES,
  MAX_ORIGINAL_BYTES,
  describeRejections,
} from "./photoUpload";
import type { SelfieUploads } from "./useSelfieUploads";

const RECOMMENDED_FROM = parseInt(SELFIE_RECOMMENDED, 10) || SELFIE_MIN;

export default function SelfieUploader({ uploads }: { uploads: SelfieUploads }) {
  const { items, add, retry, remove } = uploads;
  const [notices, setNotices] = useState<string[]>([]);

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      const next: string[] = describeRejections(rejected);
      if (accepted.length > 0) {
        const { duplicates, overLimit } = add(accepted);
        if (duplicates > 0) {
          next.push(
            duplicates === 1
              ? "1 photo was already added, so we skipped it."
              : `${duplicates} photos were already added, so we skipped them.`
          );
        }
        if (overLimit > 0) {
          next.push(
            `${SELFIE_MAX} photos is the most we can use. ${overLimit} ${
              overLimit === 1 ? "photo was" : "photos were"
            } left out.`
          );
        }
      }
      setNotices(next);
    },
    [add]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_PHOTO_TYPES,
    maxSize: MAX_ORIGINAL_BYTES,
    multiple: true,
  });

  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed");
  const pending = items.filter((i) => i.status === "queued" || i.status === "uploading").length;
  const settled = items.length - pending;
  const full = items.length >= SELFIE_MAX;

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps({
          "aria-labelledby": "selfie-drop-label",
          className: cn(
            "flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
            "hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isDragActive ? "border-primary bg-primary/10" : "border-border bg-background"
          ),
        })}
      >
        <input {...getInputProps({ id: "selfie-input" })} />
        <Camera aria-hidden className="h-7 w-7 text-primary" />
        <p id="selfie-drop-label" className="text-base font-semibold text-foreground">
          {isDragActive
            ? "Drop your photos here"
            : full
              ? "You have added the most photos we can use"
              : items.length > 0
                ? "Add more photos of your face"
                : "Choose photos of your face"}
        </p>
        <p className="text-sm text-muted-foreground">
          {ACCEPTED_PHOTO_LABEL}. Pick several at once from your camera roll.
        </p>
      </div>

      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="text-sm font-semibold text-foreground">
          <span className={done >= SELFIE_MIN ? "text-primary" : undefined}>
            {done} of {SELFIE_MIN} minimum
          </span>{" "}
          <span className="font-normal text-muted-foreground">
            · {RECOMMENDED_FROM}+ recommended
          </span>
        </p>
        {pending > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-muted-foreground">
              Uploading {Math.min(settled + 1, items.length)} of {items.length}
            </p>
            <Progress
              className="h-1.5"
              value={items.length ? (settled / items.length) * 100 : 0}
              aria-label="Photo upload progress"
            />
          </div>
        )}
      </div>

      {notices.length > 0 && (
        <div role="alert" className="rounded-md border border-destructive bg-destructive/15 p-3 text-sm text-foreground">
          <p className="font-semibold">Some photos were not added</p>
          <ul className="mt-1 list-disc space-y-0.5 break-words pl-5">
            {notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <Button
            type="button"
            variant="ghost"
            className="mt-1 h-11 px-2 text-sm underline underline-offset-4"
            onClick={() => setNotices([])}
          >
            Dismiss
          </Button>
        </div>
      )}

      {failed.length > 0 && (
        <div role="alert" className="rounded-md border border-destructive bg-destructive/15 p-3 text-sm text-foreground">
          <p className="font-semibold">
            {failed.length === 1
              ? "1 photo did not upload. Your other photos are safe."
              : `${failed.length} photos did not upload. Your other photos are safe.`}
          </p>
          <p className="mt-1">{failed[0].error}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-11"
            onClick={() => failed.forEach((f) => retry(f.id))}
          >
            <RotateCw aria-hidden className="h-4 w-4" />
            {failed.length === 1 ? "Try it again" : "Try them again"}
          </Button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {items.map((item, index) => (
            <li
              key={item.id}
              className="relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={`Your photo ${index + 1}`}
                  className={cn(
                    "h-full w-full object-cover",
                    item.status !== "done" && "opacity-50"
                  )}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-1 text-center text-xs text-muted-foreground">
                  {item.status === "failed" ? "Not uploaded" : "Getting ready"}
                </span>
              )}

              {item.status === "done" && (
                <span className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                  <span className="sr-only">Uploaded</span>
                </span>
              )}

              {(item.status === "uploading" || item.status === "queued") && (
                <span className="absolute inset-x-1 bottom-1">
                  <span className="sr-only">
                    {item.status === "queued" ? "Waiting to upload" : "Uploading"}
                  </span>
                  <span aria-hidden className="block h-1.5 overflow-hidden rounded-full bg-background/80">
                    <span
                      className="block h-full bg-primary transition-[width]"
                      style={{ width: `${Math.round(item.progress * 100)}%` }}
                    />
                  </span>
                </span>
              )}

              {item.status === "failed" && (
                <button
                  type="button"
                  onClick={() => retry(item.id)}
                  className="absolute inset-x-0 bottom-0 flex min-h-[44px] items-center justify-center gap-1 bg-destructive text-sm font-semibold text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <RotateCw aria-hidden className="h-3.5 w-3.5" />
                  Retry
                  <span className="sr-only"> upload of photo {index + 1}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`Remove photo ${index + 1}`}
                className="group absolute right-0 top-0 flex h-11 w-11 items-start justify-end p-1 focus-visible:outline-none"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground ring-1 ring-border group-hover:bg-background group-focus-visible:ring-2 group-focus-visible:ring-ring">
                  <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
