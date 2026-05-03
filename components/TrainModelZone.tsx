"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { SubmitHandler, useForm } from "react-hook-form";
import { FaFemale, FaImages, FaMale, FaRainbow } from "react-icons/fa";
import * as z from "zod";
import {
  BACKGROUND_PROMPTS,
  formatPromptOptionLabel,
  UNIFORM_TOP_BY_STYLE,
} from "@/lib/trainFieldOptions";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_TRAINING_IMAGE_UPLOAD_BYTES,
} from "@/lib/trainingUploadLimits";
import { fileUploadFormSchema } from "@/types/zod";

type FormInput = z.infer<typeof fileUploadFormSchema>;

const stripeIsConfigured = process.env.NEXT_PUBLIC_STRIPE_IS_ENABLED === "true";

function isHeicLike(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  const n = file.name.toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif");
}

/**
 * Resize to max 1200px on the longest side and export as JPEG (quality 0.85).
 * HEIC/HEIF is decoded first (browser canvas cannot read HEIC natively), then
 * treated like other images for resize/export.
 */
async function compressImage(file: File): Promise<File> {
  let decodeBlob: Blob = file;

  if (isHeicLike(file)) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.85,
    });
    decodeBlob = Array.isArray(converted) ? converted[0] : converted;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(decodeBlob, {
      imageOrientation: "from-image",
    });
  } catch {
    bitmap = await createImageBitmap(decodeBlob);
  }

  try {
    const w = bitmap.width;
    const h = bitmap.height;
    const long = Math.max(w, h);
    let tw = w;
    let th = h;
    if (long > 1200) {
      const scale = 1200 / long;
      tw = Math.round(w * scale);
      th = Math.round(h * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not prepare image canvas");
    }
    ctx.drawImage(bitmap, 0, 0, tw, th);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error("JPEG export failed"));
        },
        "image/jpeg",
        0.85
      );
    });

    const baseName = file.name.replace(/\.[^.]+$/i, "").trim() || "image";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

function ReferenceDropzone({
  title,
  description,
  file,
  onFile,
}: {
  title: string;
  description: string;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0]);
    },
    [onFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    multiple: false,
    maxSize: MAX_TRAINING_IMAGE_UPLOAD_BYTES,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="space-y-1">
        <Label className="text-base">
          {title}{" "}
          <span className="text-destructive" aria-hidden>
            *
          </span>
        </Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div
        {...getRootProps()}
        className="flex min-h-[96px] w-full cursor-pointer flex-col items-center justify-center rounded-md p-4 outline-dashed outline-2 outline-gray-100 hover:outline-blue-500"
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-sm text-muted-foreground">Drop image…</p>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <FaImages className="text-gray-700" size={28} />
            <p className="text-center text-sm text-muted-foreground">
              JPEG, PNG, or iPhone HEIC/HEIF — all are converted to compressed JPEG
              on upload
            </p>
          </div>
        )}
      </div>
      {file && previewUrl ? (
        <div className="flex w-fit flex-col gap-1">
          <img
            src={previewUrl}
            alt=""
            className="h-20 w-20 rounded-md border border-gray-200 object-cover dark:border-gray-700"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onFile(null)}
          >
            Remove
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function TrainModelZone() {
  const [files, setFiles] = useState<File[]>([]);
  const [badgeFile, setBadgeFile] = useState<File | null>(null);
  const [patchFile, setPatchFile] = useState<File | null>(null);
  const [brassFile, setBrassFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [trainingSuccessOpen, setTrainingSuccessOpen] = useState(false);
  const [trainingProgressKey, setTrainingProgressKey] = useState(0);
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<FormInput>({
    resolver: zodResolver(fileUploadFormSchema),
    defaultValues: {
      name: "",
      type: "man",
      background: "american_flag",
      uniform: "class_a",
    },
  });

  const onSubmit: SubmitHandler<FormInput> = () => {
    trainModel();
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const newFiles: File[] =
        acceptedFiles.filter(
          (file: File) => !files.some((f) => f.name === file.name)
        ) || [];

      if (newFiles.length + files.length > 10) {
        toast({
          title: "Too many images",
          description:
            "You can only upload up to 10 images in total. Please try again.",
          duration: 5000,
        });
        return;
      }

      if (newFiles.length !== acceptedFiles.length) {
        toast({
          title: "Duplicate file names",
          description:
            "Some of the files you selected were already added. They were ignored.",
          duration: 5000,
        });
      }

      const totalSize = files.reduce((acc, file) => acc + file.size, 0);
      const newSize = newFiles.reduce((acc, file) => acc + file.size, 0);

      if (totalSize + newSize > MAX_FILE_SIZE_BYTES) {
        toast({
          title: "Images exceed size limit",
          description: `The total combined size of the images cannot exceed ${Math.round(
            MAX_FILE_SIZE_BYTES / (1024 * 1024)
          )}MB.`,
          duration: 5000,
        });
        return;
      }

      setFiles([...files, ...newFiles]);

      toast({
        title: "Images selected",
        description: "The images were successfully selected.",
        duration: 5000,
      });
    },
    [files, toast]
  );

  const removeFile = useCallback(
    (file: File) => {
      setFiles(files.filter((f) => f.name !== file.name));
    },
    [files]
  );

  const uploadTrainingImage = useCallback(async (file: File): Promise<string | null> => {
    let compressed: File;
    try {
      compressed = await compressImage(file);
    } catch (e) {
      console.error(e);
      toast({
        title: "Could not process image",
        description:
          e instanceof Error
            ? e.message
            : "Try another JPEG, PNG, or HEIC file.",
        duration: 5000,
      });
      return null;
    }

    const uploadForm = new FormData();
    uploadForm.append("file", compressed);

    const uploadResponse = await fetch("/api/train-model/upload-images", {
      method: "POST",
      body: uploadForm,
    });

    if (!uploadResponse.ok) {
      const errBody = await uploadResponse.json().catch(() => ({}));
      const msg =
        typeof errBody.message === "string"
          ? errBody.message
          : "Image upload failed";
      toast({
        title: "Upload failed",
        description: msg,
        duration: 5000,
      });
      return null;
    }

    const body = (await uploadResponse.json()) as { url?: string };
    if (!body.url || typeof body.url !== "string") {
      toast({
        title: "Upload failed",
        description: "No image URL returned from the server.",
        duration: 5000,
      });
      return null;
    }

    return body.url;
  }, [toast]);

  const trainModel = useCallback(async () => {
    setIsLoading(true);

    try {
      const badge_url = badgeFile ? await uploadTrainingImage(badgeFile) : null;
      const patch_url = patchFile ? await uploadTrainingImage(patchFile) : null;
      const brass_url = brassFile ? await uploadTrainingImage(brassFile) : null;

      if (!badge_url || !patch_url || !brass_url) {
        return;
      }

      const blobUrls: string[] = [];

      for (const file of files) {
        const url = await uploadTrainingImage(file);
        if (!url) return;
        blobUrls.push(url);
      }

      const payload = {
        urls: blobUrls,
        name: form.getValues("name").trim(),
        type: form.getValues("type"),
        background: form.getValues("background"),
        uniform: form.getValues("uniform"),
        badge_url,
        patch_url,
        brass_url,
      };

      const response = await fetch("/api/train", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseData = (await response.json()) as {
        message?: string;
        checkoutUrl?: string;
      };

      if (!response.ok) {
        const responseMessage: string = responseData.message ?? "Request failed";
        console.error("Something went wrong! ", responseMessage);
        const messageWithButton = (
          <div className="flex flex-col gap-4">
            {responseMessage}
            <a href="/get-credits">
              <Button size="sm">Get Credits</Button>
            </a>
          </div>
        );
        toast({
          title: "Something went wrong!",
          description: responseMessage.includes("Not enough credits")
            ? messageWithButton
            : responseMessage,
          duration: 5000,
        });
        return;
      }

      if (
        typeof responseData.checkoutUrl === "string" &&
        responseData.checkoutUrl.length > 0
      ) {
        window.location.href = responseData.checkoutUrl;
        return;
      }

      setTrainingProgressKey((k) => k + 1);
      setTrainingSuccessOpen(true);
    } finally {
      setIsLoading(false);
    }
  }, [
    badgeFile,
    brassFile,
    files,
    form,
    patchFile,
    toast,
    uploadTrainingImage,
  ]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: MAX_TRAINING_IMAGE_UPLOAD_BYTES,
    accept: {
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
    },
  });

  const modelType = form.watch("type");
  const nameValue = form.watch("name");
  const canTrain =
    files.length >= 4 &&
    Boolean(badgeFile && patchFile && brassFile) &&
    Boolean(nameValue?.trim());

  const dismissTrainingSuccess = useCallback(() => {
    setTrainingSuccessOpen(false);
    router.push("/overview");
  }, [router]);

  return (
    <div>
      <Dialog
        open={trainingSuccessOpen}
        onOpenChange={(open) => {
          if (!open) setTrainingSuccessOpen(false);
        }}
      >
        <DialogContent
          className="fixed inset-0 left-0 top-0 z-50 flex h-[100dvh] max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-8 rounded-none border-0 bg-[#0a1628] p-8 text-center shadow-none duration-200 data-[state=closed]:slide-out-to-bottom-0 data-[state=open]:slide-in-from-bottom-0 sm:rounded-none [&>button.absolute]:hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="flex flex-col items-center space-y-6 sm:text-center">
            <Loader2
              className="h-14 w-14 shrink-0 animate-spin text-sky-400"
              strokeWidth={2}
              aria-hidden
            />
            <DialogTitle className="text-balance text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Training Your BadgeShot Model
            </DialogTitle>
            <DialogDescription className="max-w-md text-balance text-base leading-relaxed text-slate-300">
              Our AI is learning your face. This process takes 10–15 minutes.
              You&apos;ll receive an email when your headshots are ready.
            </DialogDescription>
          </DialogHeader>
          <div className="w-full max-w-md px-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-sky-500/20">
              <div
                key={trainingProgressKey}
                className="h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.35)] animate-training-progress-bar"
              />
            </div>
          </div>
          <DialogFooter className="w-full max-w-md flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              className="w-full bg-sky-600 text-white hover:bg-sky-500"
              onClick={dismissTrainingSuccess}
            >
              Got it, I&apos;ll wait for my email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="rounded-md flex flex-col gap-8"
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="w-full rounded-md">
                <FormLabel>Name</FormLabel>
                <FormDescription>
                  Give your model a name so you can easily identify it later.
                </FormDescription>
                <FormControl>
                  <Input
                    placeholder="e.g. Natalie Headshots"
                    {...field}
                    className="max-w-screen-sm"
                    autoComplete="off"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-col gap-4">
            <FormLabel>Type</FormLabel>
            <FormDescription>
              Select the type of headshots you want to generate.
            </FormDescription>
            <RadioGroup
              defaultValue={modelType}
              className="grid grid-cols-3 gap-4"
              value={modelType}
              onValueChange={(value) => {
                form.setValue("type", value);
              }}
            >
              <div>
                <RadioGroupItem
                  value="man"
                  id="man"
                  className="peer sr-only"
                  aria-label="man"
                />
                <Label
                  htmlFor="man"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <FaMale className="mb-3 h-6 w-6" />
                  Man
                </Label>
              </div>

              <div>
                <RadioGroupItem
                  value="woman"
                  id="woman"
                  className="peer sr-only"
                  aria-label="woman"
                />
                <Label
                  htmlFor="woman"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <FaFemale className="mb-3 h-6 w-6" />
                  Woman
                </Label>
              </div>
              <div>
                <RadioGroupItem
                  value="person"
                  id="person"
                  className="peer sr-only"
                  aria-label="person"
                />
                <Label
                  htmlFor="person"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <FaRainbow className="mb-3 h-6 w-6" />
                  Unisex
                </Label>
              </div>
            </RadioGroup>
          </div>
          <FormField
            control={form.control}
            name="background"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Background</FormLabel>
                <FormDescription>
                  Used in the Flux portrait prompt after training completes.
                </FormDescription>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="max-w-screen-sm">
                      <SelectValue placeholder="Choose background" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.keys(BACKGROUND_PROMPTS)
                      .sort()
                      .map((key) => (
                        <SelectItem key={key} value={key}>
                          {formatPromptOptionLabel(key)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="uniform"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Uniform</FormLabel>
                <FormDescription>
                  Class A uses the wool jacket; Class B uses a navy button-down
                  shirt instead of the jacket block.
                </FormDescription>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="max-w-screen-sm">
                      <SelectValue placeholder="Choose uniform" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.keys(UNIFORM_TOP_BY_STYLE)
                      .sort()
                      .map((key) => (
                        <SelectItem key={key} value={key}>
                          {formatPromptOptionLabel(key)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex flex-col gap-8">
            <ReferenceDropzone
              title="Badge Photo"
              description="Photo of your department badge — flat surface, good lighting, no glare"
              file={badgeFile}
              onFile={setBadgeFile}
            />
            <ReferenceDropzone
              title="Shoulder Patch"
              description="Photo of your shoulder patch — flat and straight on"
              file={patchFile}
              onFile={setPatchFile}
            />
            <ReferenceDropzone
              title="Collar Brass"
              description="Photo of your collar brass or bugles — close up, well lit"
              file={brassFile}
              onFile={setBrassFile}
            />
          </div>
          <div
            {...getRootProps()}
            className=" rounded-md justify-center align-middle cursor-pointer flex flex-col gap-4"
          >
            <FormLabel>Samples</FormLabel>
            <FormDescription>
              Upload 10-15 photos for best results. More photos = better
              likeness. iPhone photos work great.
            </FormDescription>
            <div className="outline-dashed outline-2 outline-gray-100 hover:outline-blue-500 w-full h-full rounded-md p-4 flex justify-center align-middle">
              <input {...getInputProps()} />
              {isDragActive ? (
                <p className="self-center">Drop the files here ...</p>
              ) : (
                <div className="flex justify-center flex-col items-center gap-2">
                  <FaImages size={32} className="text-gray-700" />
                  <p className="self-center">
                    Drag &apos;n&apos; drop some files here, or click to select files.
                  </p>
                </div>
              )}
            </div>
          </div>
          {files.length > 0 && (
            <div className="flex flex-row gap-4 flex-wrap">
              {files.map((file) => (
                <div key={file.name} className="flex flex-col gap-1">
                  <div className="relative">
                    <img
                      src={URL.createObjectURL(file)}
                      className="rounded-md w-24 h-24 object-cover"
                      alt="Preview"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-1"
                      type="button"
                      onClick={() => removeFile(file)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !canTrain}
          >
            Train Model{" "}
            {stripeIsConfigured && <span className="ml-1">(1 Credit)</span>}
          </Button>
        </form>
      </Form>
    </div>
  );
}
