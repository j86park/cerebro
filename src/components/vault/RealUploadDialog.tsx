"use client";

import { useState, useRef } from "react";
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
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export function RealUploadDialog({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<string>("");
  const [status, setStatus] = useState<"IDLE" | "SUCCESS" | "ERROR">("IDLE");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docTypes = Object.keys(DOCUMENT_REGISTRY);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus("IDLE");
    }
  };

  const handleUpload = async () => {
    if (!file || !docType) return;
    
    setLoading(true);
    setStatus("IDLE");
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", docType);
      
      const res = await fetch(`/api/vaults/${clientId}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      setStatus("SUCCESS");
      setTimeout(() => {
        setOpen(false);
        router.refresh();
        // Reset
        setFile(null);
        setDocType("");
        setStatus("IDLE");
      }, 1500);
      
    } catch (error) {
      console.error("Upload failed", error);
      setStatus("ERROR");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        render={
          <Button variant="outline" className="w-full mt-4 bg-primary/5 border-primary/20 hover:bg-primary/10 transition-all duration-200">
            <Upload className="mr-2 h-4 w-4" />
            Upload Real Document
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Document Upload</DialogTitle>
          <DialogDescription>
            Upload a real PDF or image to the client vault. The agents will automatically extract the text and start a compliance check.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Document Type</label>
            <Select value={docType} onValueChange={(val) => setDocType(val || "")}>
              <SelectTrigger>
                <SelectValue placeholder="What are you uploading?" />
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

          <div className="space-y-2">
            <label className="text-sm font-medium">File Source</label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200
                ${file ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"}
              `}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".pdf,.png,.jpg,.jpeg"
              />
              
              {file ? (
                <>
                  <FileText className="h-10 w-10 text-primary" />
                  <div className="text-sm font-medium text-center truncate max-w-full px-4">
                    {file.name}
                  </div>
                  <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-xs text-muted-foreground underline">
                    Change file
                  </Button>
                </>
              ) : (
                <>
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="text-sm text-muted-foreground text-center">
                    <span className="text-primary font-medium">Click to upload</span> or drag and drop
                  </div>
                  <p className="text-xs text-muted-foreground/50">PDF, PNG, or JPG (max. 10MB)</p>
                </>
              )}
            </div>
          </div>

          {status === "SUCCESS" && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-500 rounded-md text-sm border border-green-500/20">
              <CheckCircle2 className="h-4 w-4" />
              Upload successful! Triggering agents...
            </div>
          )}

          {status === "ERROR" && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-md text-sm border border-destructive/20">
              <AlertCircle className="h-4 w-4" />
              Upload failed. Please try again.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleUpload} disabled={!file || !docType || loading || status === "SUCCESS"}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : "Upload & Analyze"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
