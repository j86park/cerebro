/**
 * Row-level health dot colors (frontend.mdc Operations Dashboard).
 */
export function vaultRowHealthBgClass(highestUrgency: string): string {
  const u = highestUrgency.toUpperCase();
  if (u === "CRITICAL") return "bg-red-500";
  if (u === "HIGH" || u === "MEDIUM") return "bg-yellow-500";
  return "bg-green-500";
}
