"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function FloorPlanUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("uploading");
    setMessage("");

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch("/api/admin/floorplans/upload", {
        method: "POST",
        body: data,
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(json.error + (json.stderr ? `\n${json.stderr}` : ""));
        return;
      }
      setStatus("done");
      setMessage(json.stdout || "Conversion complete.");
      router.push(`/admin/floorplans/${json.id}`);
    } catch (err) {
      setStatus("error");
      setMessage(String(err));
    }
  }

  return (
    <div className="border rounded-md p-4">
      <h3 className="text-sm font-medium mb-4">Upload DXF floor plan</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="building" className="text-xs">Building</Label>
            <Input id="building" name="building" placeholder="A" required className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="floor" className="text-xs">Floor</Label>
            <Input id="floor" name="floor" type="number" placeholder="1" required className="h-8 text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="dxf" className="text-xs">DXF file</Label>
          <input
            ref={fileRef}
            id="dxf"
            name="dxf"
            type="file"
            accept=".dxf"
            required
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded file:border file:border-gray-300 file:text-xs file:bg-white file:hover:bg-gray-50 cursor-pointer"
          />
        </div>
        <Button type="submit" size="sm" disabled={status === "uploading"}>
          {status === "uploading" ? "Converting…" : "Upload & convert"}
        </Button>
      </form>

      {message && (
        <pre className={`mt-3 text-xs rounded p-3 whitespace-pre-wrap font-mono ${
          status === "error" ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-600"
        }`}>
          {message}
        </pre>
      )}
    </div>
  );
}
