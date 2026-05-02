import { MAX_TRAINING_IMAGE_UPLOAD_BYTES } from "@/lib/trainingUploadLimits";
import { Database } from "@/types/supabase";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const TRAINING_BUCKET =
  process.env.SUPABASE_TRAINING_DATASETS_BUCKET ?? "training-datasets";

function isAllowedImage(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (
    t === "image/jpeg" ||
    t === "image/jpg" ||
    t === "image/png" ||
    t === "image/gif"
  ) {
    return true;
  }
  const n = file.name.toLowerCase();
  return (
    n.endsWith(".jpg") ||
    n.endsWith(".jpeg") ||
    n.endsWith(".png") ||
    n.endsWith(".gif")
  );
}

/** Avoid path traversal; keep a usable filename for the object key. */
function safeFileName(name: string): string {
  const base = name.replace(/[/\\]/g, "_").trim() || "image.jpg";
  return base.slice(0, 200);
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json(
      { message: "Missing Supabase configuration" },
      { status: 500 }
    );
  }

  const supabase = createRouteHandlerClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "Invalid multipart body" },
      { status: 400 }
    );
  }

  const raw = formData.get("file");
  if (!(raw instanceof File)) {
    return NextResponse.json(
      { message: "No image file provided (expected form field \"file\")" },
      { status: 400 }
    );
  }

  const file = raw;

  if (!isAllowedImage(file)) {
    return NextResponse.json(
      { message: "Only JPEG, PNG, and GIF images are allowed" },
      { status: 400 }
    );
  }

  if (file.size > MAX_TRAINING_IMAGE_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        message: `Each image must be at most ${Math.floor(
          MAX_TRAINING_IMAGE_UPLOAD_BYTES / (1024 * 1024)
        )}MB per upload.`,
      },
      { status: 400 }
    );
  }

  const safe = safeFileName(file.name);
  const baseNoExt = safe.replace(/\.[^.]+$/, "").trim() || "image";
  const pathname = `${user.id}/uploads/${Date.now()}_${baseNoExt.slice(0, 180)}.jpg`;

  const admin = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let compressed: Buffer;
    try {
      compressed = await sharp(buffer)
        .resize(1200, 1200, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (compressErr) {
      console.error("Image compression failed:", compressErr);
      return NextResponse.json(
        { message: "Could not process image — try a different JPEG or PNG file." },
        { status: 400 }
      );
    }

    const { error: uploadError } = await admin.storage
      .from(TRAINING_BUCKET)
      .upload(pathname, compressed, {
        contentType: "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase storage upload failed:", uploadError);
      return NextResponse.json(
        { message: "Could not upload image to storage" },
        { status: 502 }
      );
    }

    const { data: urlData } = admin.storage
      .from(TRAINING_BUCKET)
      .getPublicUrl(pathname);

    const publicUrl = urlData.publicUrl;
    return NextResponse.json({ url: publicUrl });
  } catch (e) {
    console.error("Upload failed:", e);
    return NextResponse.json(
      { message: "Could not upload image to storage" },
      { status: 502 }
    );
  }
}
