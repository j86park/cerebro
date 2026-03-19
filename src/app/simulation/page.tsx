import { SimulationRunList } from "@/components/simulation/SimulationRunList";
import { NewSimulationDialog } from "@/components/simulation/NewSimulationDialog";

export const metadata = {
  title: "Simulation Dashboard | Cerebro",
  description: "Monitor large-scale AI simulation performance and metrics.",
};

export default function SimulationPage() {
  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Simulation Dashboard</h1>
          <p className="text-muted-foreground">Monitor performance metrics and audit history for large-scale agent simulations.</p>
        </div>
        <NewSimulationDialog />
      </div>

      <SimulationRunList />
    </div>
  );
}
