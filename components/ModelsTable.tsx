"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Icons } from "./icons";
import { useRouter } from "next/navigation";
import { modelRowWithSamples } from "@/types/utils";
import { Trash2 } from "lucide-react";
import type { MouseEvent } from "react";

type ModelsTableProps = {
  models: modelRowWithSamples[];
  onModelDeleted?: (id: number) => void;
};

export default function ModelsTable({ models, onModelDeleted }: ModelsTableProps) {
  const router = useRouter();
  const handleRedirect = (id: number) => {
    router.push(`/overview/models/${id}`);
  };

  const handleDelete = async (e: MouseEvent, model: modelRowWithSamples) => {
    e.stopPropagation();
    if (model.status === "processing") {
      alert("Cannot delete a model that is currently processing.");
      return;
    }
    if (
      !confirm("Delete this model and all its images? This cannot be undone.")
    ) {
      return;
    }
    const res = await fetch(`/api/models/${model.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      alert(body?.message ?? "Failed to delete model.");
      return;
    }
    onModelDeleted?.(model.id);
  };

  return (
    <div className="rounded-md border">
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Samples</TableHead>
            <TableHead className="w-[52px] text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {models?.map((model) => (
            <TableRow
              key={model.id}
              onClick={() => handleRedirect(model.id)}
              className="cursor-pointer h-16"
            >
              <TableCell className="font-medium">{model.name}</TableCell>
              <TableCell>
                <div>
                  <Badge
                    className="flex gap-2 items-center w-min"
                    variant={
                      model.status === "finished" ? "default" : "secondary"
                    }
                  >
                    {model.status === "processing" ? "training" : model.status }
                    {model.status === "processing" && (
                      <Icons.spinner className="h-4 w-4 animate-spin" />
                    )}
                  </Badge>
                </div>
              </TableCell>
              <TableCell>{model.type}</TableCell>
              <TableCell>
                <div className="flex gap-2 flex-shrink-0 items-center">
                  {model.samples.slice(0, 3).map((sample) => (
                    <Avatar key={sample.id}>
                      <AvatarImage src={sample.uri} className="object-cover" />
                    </Avatar>
                  ))}
                  {model.samples.length > 3 && (
                    <Badge className="rounded-full h-10" variant={"outline"}>
                      +{model.samples.length - 3}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right p-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  aria-label="Delete model"
                  onClick={(e) => handleDelete(e, model)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
