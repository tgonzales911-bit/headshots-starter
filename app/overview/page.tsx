import ClientSideModelsList from "@/components/realtime/ClientSideModelsList";
import { toOrderSummary } from "@/components/order/orderHelpers";
import { SUPPORT_EMAIL } from "@/lib/site";
import { Database } from "@/types/supabase";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Your orders — BadgeShot",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: { payment?: string | string[] };
}) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Foverview");
  }

  const { data: models } = await supabase
    .from("models")
    .select("id, status, created_at, name, prompt_options")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  // Older finished orders keep their portraits only in the headshots table.
  const finishedIds = (models ?? []).filter((m) => m.status === "finished").map((m) => m.id);
  const fallbackThumbs = new Map<number, string>();
  if (finishedIds.length > 0) {
    const { data: headshots } = await supabase
      .from("headshots")
      .select("model_id, uri, id")
      .in("model_id", finishedIds)
      .order("id", { ascending: true });
    for (const h of headshots ?? []) {
      if (!fallbackThumbs.has(h.model_id)) fallbackThumbs.set(h.model_id, h.uri);
    }
  }

  const orders = (models ?? []).map((m) => toOrderSummary(m, fallbackThumbs.get(m.id)));
  const paymentProblem = searchParams?.payment === "problem";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {paymentProblem && (
        <div
          role="alert"
          className="rounded-lg border-2 border-primary bg-primary/10 p-4 text-base leading-relaxed text-foreground sm:p-5"
        >
          <p>
            Your payment went through, but we could not start your order automatically. We have
            been alerted and will start it by hand — you do not need to pay again. Questions:{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="break-all font-semibold text-primary underline underline-offset-4"
            >
              {SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      )}
      <h1 className="font-display text-3xl leading-tight text-foreground sm:text-4xl">
        Your orders
      </h1>
      <ClientSideModelsList serverOrders={orders} userId={user.id} />
    </div>
  );
}
