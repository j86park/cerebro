"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";

interface FailureInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    clientId: string;
    agent: string;
    scorerId: string;
    score: number;
    reason: string;
    output: string;
    expected: any;
  } | null;
}

export function FailureInspector({ isOpen, onClose, data }: FailureInspectorProps) {
  if (!data) return null;

  const isPass = data.score === 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b">
          <div className="flex items-center justify-between pr-8">
            <div className="flex flex-col gap-1">
              <DialogTitle className="flex items-center gap-2 text-xl">
                <span>Scenario: {data.clientId}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{data.scorerId.replace("Scorer", "")}</span>
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                 <Badge variant="secondary">{data.agent}</Badge>
                 {isPass ? (
                   <span className="flex items-center gap-1 text-xs text-pass font-medium">
                     <CheckCircle2 className="h-3 w-3" /> PASSED
                   </span>
                 ) : (
                   <span className="flex items-center gap-1 text-xs text-fail font-medium">
                     <AlertCircle className="h-3 w-3" /> FAILED
                   </span>
                 )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            <section>
              <h4 className="text-sm font-semibold mb-2">Scorer Reasoning</h4>
              <div className={`p-4 rounded-md text-sm ${isPass ? "bg-pass/10 text-pass border border-pass/20" : "bg-fail/10 text-fail border border-fail/20"}`}>
                {data.reason}
              </div>
            </section>

            <section>
              <h4 className="text-sm font-semibold mb-2">Agent Execution reasoning</h4>
              <div className="bg-muted p-4 rounded-md font-mono text-xs whitespace-pre-wrap max-h-60 overflow-y-auto border">
                {data.output || "No output captured."}
              </div>
            </section>

            <Separator />

            <section className="grid md:grid-cols-2 gap-4">
               <div>
                  <h4 className="text-sm font-semibold mb-2">Expected Outcome</h4>
                  <pre className="bg-muted p-3 rounded-md text-[10px] border">
                    {JSON.stringify(data.expected, null, 2)}
                  </pre>
               </div>
               <div>
                  <h4 className="text-sm font-semibold mb-2">Metrics</h4>
                  <div className="space-y-2">
                     <div className="flex justify-between text-xs py-1 border-b">
                        <span className="text-muted-foreground">Raw Score</span>
                        <span className="font-medium">{data.score}</span>
                     </div>
                     <div className="flex justify-between text-xs py-1 border-b">
                        <span className="text-muted-foreground">Scorer ID</span>
                        <span className="font-medium">{data.scorerId}</span>
                     </div>
                  </div>
               </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
