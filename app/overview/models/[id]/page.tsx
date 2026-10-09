import OperatorDiagnostics from "@/components/order/OperatorDiagnostics";
import { orderCustomerName } from "@/components/order/orderHelpers";
import ClientSideModel from "@/components/realtime/ClientSideModel";
import { collectFinalDownloadUrls } from "@/lib/finalDownloadUrls";
import { Database } from "@/types/supabase";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your order — BadgeShot",
};

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { payment?: string | string[] };
}) {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const orderId = Number(params.id);
  const validId = Number.isInteger(orderId) && orderId > 0;
  const paymentSuccess = searchParams?.payment === "success";

  if (!user) {
    const back = validId
      ? `/overview/models/${orderId}${paymentSuccess ? "?payment=success" : ""}`
      : "/overview";
    redirect(`/login?next=${encodeURIComponent(back)}`);
  }

  if (!validId) {
    redirect("/overview");
  }

  const { data: model } = await supabase
    .from("models")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (!model) {
    redirect("/overview");
  }

  const finished = model.status === "finished";

  const [{ data: samples }, { data: headshots }, { data: images }] = await Promise.all([
    supabase.from("samples").select("id, uri").eq("modelId", model.id).order("id"),
    finished
      ? supabase.from("headshots").select("*").eq("model_id", model.id).order("id")
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["headshots"]["Row"][] }),
    finished
      ? supabase.from("images").select("*").eq("modelId", model.id).order("id")
      : Promise.resolve({ data: [] as Database["public"]["Tables"]["images"]["Row"][] }),
  ]);

  // Only finished, operator-approved portraits ever reach the customer's browser.
  const finalUrls = finished
    ? collectFinalDownloadUrls(model, headshots ?? [], images ?? [])
    : [];

  // Server-side only: decides whether pipeline internals are rendered at all.
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const isAdmin = Boolean(adminEmail) && user.email === adminEmail;

  let operatorPanel: React.ReactNode = null;
  if (isAdmin) {
    const po =
      model.prompt_options && typeof model.prompt_options === "object" && !Array.isArray(model.prompt_options)
        ? (model.prompt_options as Record<string, unknown>)
        : {};
    const loraUrl =
      model.lora_url ?? (model.modelId?.startsWith("http") ? model.modelId : null);
    operatorPanel = (
      <OperatorDiagnostics
        modelId={model.id}
        rawStatus={model.status}
        candidateUrls={stringList(po.final_edit_results)}
        loraUrl={loraUrl}
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Link
        href="/overview"
        className="inline-flex min-h-[44px] w-fit items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Your orders
      </Link>

      <ClientSideModel
        order={{
          id: model.id,
          status: model.status,
          createdAt: model.created_at,
          customerName: orderCustomerName(model),
        }}
        finalUrls={finalUrls}
        selfies={samples ?? []}
        customerEmail={user.email ?? null}
        paymentSuccess={paymentSuccess}
        operatorPanel={operatorPanel}
      />
    </div>
  );
}
