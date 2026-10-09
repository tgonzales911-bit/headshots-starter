import TrainModelZone from "@/components/TrainModelZone";
import {
  DELIVERY_PROMISE,
  ORDER_PRICE_LABEL,
  PORTRAITS_PER_ORDER,
} from "@/lib/site";
import { Database } from "@/types/supabase";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { ArrowLeft } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Start your order — BadgeShot",
};

export default async function StartOrderPage({
  searchParams,
}: {
  searchParams?: { canceled?: string | string[] };
}) {
  const supabase = createServerComponentClient<Database>({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=%2Foverview%2Fmodels%2Ftrain");
  }

  const canceled = searchParams?.canceled === "1";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Link
        href="/overview"
        className="inline-flex min-h-[44px] w-fit items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Your orders
      </Link>

      {canceled && (
        <p
          role="status"
          className="rounded-lg border border-primary/50 bg-primary/10 p-4 text-base leading-relaxed text-foreground"
        >
          Payment was cancelled. Your details are saved below — you have not been charged.
        </p>
      )}

      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl leading-tight text-foreground sm:text-4xl">
          Start your order
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
          {PORTRAITS_PER_ORDER} Class A portraits wearing your own badge, patch and collar brass,
          for {ORDER_PRICE_LABEL}. {DELIVERY_PROMISE}.
        </p>
      </header>

      <TrainModelZone />
    </div>
  );
}
