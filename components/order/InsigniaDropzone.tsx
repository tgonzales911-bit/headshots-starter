"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertTriangle, ImagePlus, Loader2, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import InsigniaDiagram, { type InsigniaKind } from "./InsigniaDiagram";
import type { DraftPhoto } from "./orderDraft";
import {
  ACCEPTED_PHOTO_LABEL,
  ACCEPTED_PHOTO_TYPES,
  MAX_ORIGINAL_BYTES,
  describeRejections,
  photoErrorMessage,
  preparePhoto,
  uploadPhoto,
} from "./photoUpload";

/** Below this on the shorter side, engraving and stitching start to blur. */
const SMALL_SIDE_PX = 1000;

type Props = {
  /** Unique slug, used for element ids. */
  slot: string;
  title: string;
  required?: boolean;
  /** What is specific to this item. General how-to lives above the group. */
  instructions: ReactNode;
  diagram?: InsigniaKind;
  value: DraftPhoto | null;
  onChange: (photo: DraftPhoto | null) => void;
  /** Lets the form say "still uploading" instead of "missing". */
  onBusyChange?: (busy: boolean) => void;
};

type Phase =
  | { name: "idle" }
  | { name: "working"; progress: number }
  | { name: "failed"; message: string };

export default function InsigniaDropzone({
  slot,
  title,
  required = false,
  instructions,
  diagram,
  value,
  onChange,
  onBusyChange,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [rejections, setRejections] = useState<string[]>([]);
  const lastFile = useRef<File | null>(null);
  const attempt = useRef(0);
  const previewRef = useRef<string | null>(null);

  const replacePreview = useCallback((next: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next;
    setLocalPreview(next);
  }, []);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    },
    []
  );

  const start = useCallback(
    async (file: File) => {
      const mine = ++attempt.current;
      lastFile.current = file;
      setRejections([]);
      setPhase({ name: "working", progress: 0 });
      onBusyChange?.(true);
      onChange(null);
      replacePreview(null);
      try {
        const prepared = await preparePhoto(file, "reference");
        if (mine !== attempt.current) return;
        replacePreview(URL.createObjectURL(prepared.file));
        const url = await uploadPhoto(prepared.file, "reference", (f) => {
          if (mine === attempt.current) setPhase({ name: "working", progress: f });
        });
        if (mine !== attempt.current) return;
        onChange({
          url,
          name: file.name,
          width: prepared.originalWidth,
          height: prepared.originalHeight,
        });
        setPhase({ name: "idle" });
      } catch (e) {
        if (mine !== attempt.current) return;
        setPhase({ name: "failed", message: photoErrorMessage(e) });
      } finally {
        if (mine === attempt.current) onBusyChange?.(false);
      }
    },
    [onBusyChange, onChange, replacePreview]
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (accepted[0]) {
        void start(accepted[0]);
      } else if (rejected.length > 0) {
        setRejections(describeRejections(rejected));
      }
    },
    [start]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPTED_PHOTO_TYPES,
    maxSize: MAX_ORIGINAL_BYTES,
    maxFiles: 1,
    multiple: false,
  });

  const clear = () => {
    attempt.current += 1;
    lastFile.current = null;
    replacePreview(null);
    setPhase({ name: "idle" });
    setRejections([]);
    onBusyChange?.(false);
    onChange(null);
  };

  const preview = localPreview ?? value?.url ?? null;
  const hasPhoto = Boolean(preview);
  const tooSmall = value ? Math.min(value.width, value.height) < SMALL_SIDE_PX && value.width > 0 : false;
  const headingId = `${slot}-heading`;

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5">
      <div>
        <h3 id={headingId} className="text-lg font-semibold text-card-foreground">
          {title}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {required ? "(required)" : "(optional)"}
          </span>
        </h3>
        <div className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {instructions}
        </div>
      </div>

      {diagram && <InsigniaDiagram kind={diagram} />}

      {/* The dropzone stays mounted (hidden once a photo is chosen) so "Replace" can reopen the picker. */}
      <div
        {...getRootProps({
          "aria-labelledby": headingId,
          className: cn(
            "min-h-[96px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors",
            "hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isDragActive ? "border-primary bg-primary/10" : "border-border bg-background",
            hasPhoto || phase.name === "working" ? "hidden" : "flex"
          ),
        })}
      >
        <input {...getInputProps({ id: `${slot}-input` })} />
        <ImagePlus aria-hidden className="h-6 w-6 text-primary" />
        <p className="text-base font-semibold text-foreground">
          {isDragActive ? "Drop the photo here" : "Take or choose a photo"}
        </p>
        <p className="text-sm text-muted-foreground">{ACCEPTED_PHOTO_LABEL}</p>
      </div>

      {rejections.length > 0 && (
        <p role="alert" className="break-words rounded-md border border-destructive bg-destructive/15 p-3 text-sm text-foreground">
          {rejections.join(". ")}. Choose a different photo.
        </p>
      )}

      {phase.name === "working" && !hasPhoto && (
        <p className="flex min-h-[96px] items-center justify-center gap-2 rounded-lg border bg-background text-sm text-muted-foreground">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
          Getting your photo ready
        </p>
      )}

      {hasPhoto && preview && (
        <div className="flex flex-col gap-3">
          <a
            href={preview}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-md border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt={`Your ${title.toLowerCase()} photo. Opens full size in a new tab.`}
              className="mx-auto max-h-[70vh] w-full object-contain"
            />
          </a>

          <p className="text-sm font-semibold text-foreground">
            Zoom in: can you read every letter? If not, retake it.
          </p>

          <div aria-live="polite">
            {phase.name === "working" && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
                Uploading, {Math.round(phase.progress * 100)}%
              </p>
            )}
            {phase.name === "idle" && value && (
              <p className="text-sm text-muted-foreground">Uploaded.</p>
            )}
          </div>

          {tooSmall && (
            <p className="flex gap-2 rounded-md border border-primary/50 bg-primary/10 p-3 text-sm text-foreground">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                This photo is small, so fine detail may be lost in your portraits. You can keep
                it, but a closer, full-size photo will look better.
              </span>
            </p>
          )}
        </div>
      )}

      {phase.name === "failed" && (
        <div role="alert" className="rounded-md border border-destructive bg-destructive/15 p-3 text-sm text-foreground">
          <p>{phase.message}</p>
          {lastFile.current && (
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-11"
              onClick={() => lastFile.current && void start(lastFile.current)}
            >
              <RotateCw aria-hidden className="h-4 w-4" />
              Try again
            </Button>
          )}
        </div>
      )}

      {hasPhoto && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={open}>
            Replace photo
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={clear}>
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}
