"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DOCUMENT_REGISTRY } from "@/lib/documents/registry";
import { Upload } from "lucide-react";

export function MockUploadDialog({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docType, setDocType] = useState<string>("");

  const docTypes = Object.keys(DOCUMENT_REGISTRY);

  const handleUpload = async () => {
    if (!docType) return;
    
    setLoading(true);
    try {
      await fetch(`/api/vaults/${clientId}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentType: docType }),
      });
      setOpen(false);
      router.refresh();
      // Reset form
      setDocType("");
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="w-full mt-4 bg-background border border-input hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
        <Upload className="mr-2 h-4 w-4" />
        Simulate Document Upload
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Mock Document Upload</DialogTitle>
          <DialogDescription>
            Simulate a client uploading a document to their vault. This will trigger an EVENT agent run for processing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Document Type
            </label>
            <Select value={docType} onValueChange={(val) => setDocType(val || "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select a document type" />
              </SelectTrigger>
              <SelectContent>
                {docTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {DOCUMENT_REGISTRY[type as keyof typeof DOCUMENT_REGISTRY].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!docType || loading}>
            {loading ? "Uploading..." : "Upload & Trigger Agent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
