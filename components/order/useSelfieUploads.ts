"use client";

import { SELFIE_MAX, SUPPORT_EMAIL } from "@/lib/site";
import { MAX_FILE_SIZE_BYTES } from "@/lib/trainingUploadLimits";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { DraftSelfie } from "./orderDraft";
import { PhotoError, fileKey, photoErrorMessage, preparePhoto, uploadPhoto } from "./photoUpload";

export type SelfieStatus = "queued" | "uploading" | "done" | "failed";

export type SelfieItem = {
  id: string;
  key: string;
  name: string;
  status: SelfieStatus;
  /** 0 to 1 while uploading. */
  progress: number;
  previewUrl?: string;
  url?: string;
  /** Size of the resized copy we uploaded. */
  bytes: number;
  error?: string;
};

export type AddResult = { duplicates: number; overLimit: number };

const CONCURRENCY = 3;

const TOTAL_TOO_LARGE = `Your photos add up to more than we can accept in one order. Remove a few and try again, or email ${SUPPORT_EMAIL}.`;

type Entry = { file?: File; bytes: number; objectUrl?: string };

/**
 * Owns the upload queue. Lives outside React state so a slow upload finishing
 * after a re-render (or after its photo was removed) cannot corrupt anything.
 */
function createController(setItems: Dispatch<SetStateAction<SelfieItem[]>>) {
  const entries = new Map<string, Entry>();
  const keys = new Map<string, string>(); // file identity -> item id
  const queue: string[] = [];
  let active = 0;
  let totalBytes = 0;
  let seq = 0;

  const patch = (id: string, p: Partial<SelfieItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));

  const run = async (id: string) => {
    const entry = entries.get(id);
    if (!entry?.file) return;
    patch(id, { status: "uploading", progress: 0, error: undefined });
    let counted = 0;
    try {
      const prepared = await preparePhoto(entry.file, "selfie");
      if (!entries.has(id)) return;
      if (totalBytes + prepared.file.size > MAX_FILE_SIZE_BYTES) {
        throw new PhotoError(TOTAL_TOO_LARGE);
      }
      counted = prepared.file.size;
      totalBytes += counted;
      if (!entry.objectUrl) {
        entry.objectUrl = URL.createObjectURL(prepared.file);
        patch(id, { previewUrl: entry.objectUrl });
      }
      const url = await uploadPhoto(prepared.file, "selfie", (f) => patch(id, { progress: f }));
      if (!entries.has(id)) {
        totalBytes -= counted;
        return;
      }
      entry.bytes = counted;
      patch(id, { status: "done", progress: 1, url, bytes: counted });
    } catch (e) {
      totalBytes -= counted;
      if (entries.has(id)) patch(id, { status: "failed", error: photoErrorMessage(e) });
    }
  };

  const pump = () => {
    while (active < CONCURRENCY && queue.length > 0) {
      const id = queue.shift() as string;
      if (!entries.has(id)) continue;
      active += 1;
      void run(id).finally(() => {
        active -= 1;
        pump();
      });
    }
  };

  return {
    add(files: File[]): AddResult {
      let duplicates = 0;
      let overLimit = 0;
      const fresh: SelfieItem[] = [];
      for (const file of files) {
        const key = fileKey(file);
        if (keys.has(key)) {
          duplicates += 1;
          continue;
        }
        if (entries.size >= SELFIE_MAX) {
          overLimit += 1;
          continue;
        }
        seq += 1;
        const id = `p${Date.now().toString(36)}${seq}`;
        entries.set(id, { file, bytes: 0 });
        keys.set(key, id);
        queue.push(id);
        fresh.push({ id, key, name: file.name, status: "queued", progress: 0, bytes: 0 });
      }
      if (fresh.length > 0) {
        setItems((prev) => [...prev, ...fresh]);
        pump();
      }
      return { duplicates, overLimit };
    },

    /** Photos already uploaded in an earlier visit (restored from the saved draft). */
    restore(saved: DraftSelfie[]) {
      const restored: SelfieItem[] = [];
      for (const s of saved) {
        if (keys.has(s.key) || entries.size >= SELFIE_MAX) continue;
        seq += 1;
        const id = `r${seq}`;
        const bytes = Number.isFinite(s.bytes) ? s.bytes : 0;
        entries.set(id, { bytes });
        keys.set(s.key, id);
        totalBytes += bytes;
        restored.push({
          id,
          key: s.key,
          name: s.name,
          status: "done",
          progress: 1,
          url: s.url,
          previewUrl: s.url,
          bytes,
        });
      }
      if (restored.length > 0) setItems((prev) => [...prev, ...restored]);
    },

    retry(id: string) {
      const entry = entries.get(id);
      if (!entry?.file) return;
      patch(id, { status: "queued", progress: 0, error: undefined });
      queue.push(id);
      pump();
    },

    remove(id: string) {
      const entry = entries.get(id);
      if (!entry) return;
      entries.delete(id);
      keys.forEach((value, key) => {
        if (value === id) keys.delete(key);
      });
      totalBytes -= entry.bytes;
      if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
      setItems((prev) => prev.filter((it) => it.id !== id));
    },

    dispose() {
      // Only release preview memory. The bookkeeping stays intact so React's
      // development double-mount cannot duplicate restored photos.
      entries.forEach((entry) => {
        if (entry.objectUrl) URL.revokeObjectURL(entry.objectUrl);
        entry.objectUrl = undefined;
      });
    },
  };
}

export type SelfieUploads = ReturnType<typeof useSelfieUploads>;

export function useSelfieUploads() {
  const [items, setItems] = useState<SelfieItem[]>([]);
  const [controller] = useState(() => createController(setItems));

  useEffect(() => () => controller.dispose(), [controller]);

  return {
    items,
    add: controller.add,
    restore: controller.restore,
    retry: controller.retry,
    remove: controller.remove,
  };
}
