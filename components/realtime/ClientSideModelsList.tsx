"use client";

import ModelsTable from "@/components/ModelsTable";
import { toOrderSummary, type OrderSummary } from "@/components/order/orderHelpers";
import { Button } from "@/components/ui/button";
import { DELIVERY_PROMISE, ORDER_PRICE_LABEL, PORTRAITS_PER_ORDER } from "@/lib/site";
import { Database } from "@/types/supabase";
import type { modelRow } from "@/types/utils";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

type ClientSideModelsListProps = {
  serverOrders: OrderSummary[];
  userId: string;
};

function newestFirst(orders: OrderSummary[]): OrderSummary[] {
  return [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export default function ClientSideModelsList({
  serverOrders,
  userId,
}: ClientSideModelsListProps) {
  // The signed-in client: row-level security only shows a customer their own orders.
  const [supabase] = useState(() => createClientComponentClient<Database>());
  const [orders, setOrders] = useState<OrderSummary[]>(() => newestFirst(serverOrders));

  useEffect(() => {
    setOrders(newestFirst(serverOrders));
  }, [serverOrders]);

  useEffect(() => {
    const channel = supabase
      .channel(`orders-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "models", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const goneId = (payload.old as Partial<modelRow>).id;
            if (typeof goneId === "number") {
              setOrders((prev) => prev.filter((o) => o.id !== goneId));
            }
            return;
          }
          const row = payload.new as modelRow;
          if (!row || typeof row.id !== "number" || row.user_id !== userId) return;
          setOrders((prev) => {
            const existing = prev.find((o) => o.id === row.id);
            const next = toOrderSummary(row, existing?.thumbUrl);
            return newestFirst([...prev.filter((o) => o.id !== row.id), next]);
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-lg border bg-card p-6 sm:p-8">
        <h2 className="font-display text-2xl text-card-foreground">No orders yet</h2>
        <p className="max-w-prose text-base leading-relaxed text-muted-foreground">
          One order is {PORTRAITS_PER_ORDER} Class A portraits wearing your own badge, patch and
          collar brass, for {ORDER_PRICE_LABEL}. {DELIVERY_PROMISE}.
        </p>
        <Button asChild className="h-12 px-6 text-base font-semibold">
          <Link href="/overview/models/train">Start my order</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ModelsTable
        orders={orders}
        onOrderRemoved={(id) => setOrders((prev) => prev.filter((o) => o.id !== id))}
      />
      <Button asChild variant="outline" className="h-11 w-full sm:w-fit">
        <Link href="/overview/models/train">Start another order</Link>
      </Button>
    </div>
  );
}
