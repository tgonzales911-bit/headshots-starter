"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function PurchaseToContinueButton() {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/create-checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; message?: string };
      if (!res.ok) {
        alert(data.message ?? "Could not start checkout.");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      alert("No checkout URL returned.");
    } catch (e) {
      console.error(e);
      alert("Could not start checkout.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        You need a training credit to continue. Purchase one to upload photos and start training.
      </p>
      <Button type="button" onClick={onClick} disabled={loading} className="w-fit">
        {loading ? "Redirecting…" : "Purchase to continue"}
      </Button>
    </div>
  );
}
