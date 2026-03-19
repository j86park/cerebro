"use client";

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Play, Loader2 } from "lucide-react";

export function NewSimulationDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState({
    clientCount: 10000,
    simulatedDays: 30,
    useMockAgents: true,
  });

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/simulation/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error("Failed to start simulation");
      setOpen(false);
      // Refresh page or trigger internal list update would be better
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("Error starting simulation. Check logs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="bg-blue-600 hover:bg-blue-700 text-white">
            <Play className="w-4 h-4 mr-2" />
            Start New Simulation
          </Button>
        }
      />
      <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader>
          <DialogTitle>Configure Simulation</DialogTitle>
          <DialogDescription className="text-slate-400">
            Initialize a large-scale performance run with synthetic clients.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="clientCount">Client Count</Label>
            <input
              id="clientCount"
              type="number"
              className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={params.clientCount}
              onChange={(e) => setParams({ ...params, clientCount: parseInt(e.target.value) })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="simulatedDays">Simulated Days</Label>
            <input
              id="simulatedDays"
              type="number"
              className="flex h-10 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={params.simulatedDays}
              onChange={(e) => setParams({ ...params, simulatedDays: parseInt(e.target.value) })}
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              id="useMockAgents"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500"
              checked={params.useMockAgents}
              onChange={(e) => setParams({ ...params, useMockAgents: e.target.checked })}
            />
            <Label htmlFor="useMockAgents">Use High-Performance Mock Agents</Label>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]" 
            onClick={handleStart} 
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Initializing...
              </>
            ) : (
              "Run Simulation"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
