"use client";

import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui-extensions/StatusBadge";
import { format } from "date-fns";
import { DOCUMENT_REGISTRY } from "@/lib/documents/registry";

export type DocumentData = {
  id: string;
  type: string;
  category: string;
  status: string;
  expiryDate: string | null;
  uploadedAt: string | null;
  notificationCount: number;
};

export function DocumentsTable({ documents }: { documents: DocumentData[] }) {
  // Sort documents: EXPIRED > MISSING > EXPIRING_SOON > others
  const sortedDocs = [...documents].sort((a, b) => {
    const rank = { EXPIRED: 4, MISSING: 3, EXPIRING_SOON: 2, PENDING_REVIEW: 1 };
    const rankA = rank[a.status as keyof typeof rank] || 0;
    const rankB = rank[b.status as keyof typeof rank] || 0;
    return rankB - rankA;
  });

  return (
    <div className="rounded-md border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document Type</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Expiry Date</TableHead>
            <TableHead className="text-right">Notifications</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedDocs.map((doc) => {
            const meta = DOCUMENT_REGISTRY[doc.type as keyof typeof DOCUMENT_REGISTRY];
            const isRed = doc.status === "EXPIRED";
            const isYellow = doc.status === "EXPIRING_SOON";
            
            return (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">
                  {meta?.label || doc.type}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs bg-secondary">
                    {doc.category.replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge status={doc.status} />
                </TableCell>
                <TableCell className={isRed ? "text-red-500 font-medium" : isYellow ? "text-amber-500 font-medium" : "text-muted-foreground"}>
                  {doc.expiryDate ? format(new Date(doc.expiryDate), "MMM d, yyyy") : "N/A"}
                </TableCell>
                <TableCell className="text-right">
                  {doc.notificationCount > 0 ? (
                    <Badge variant="secondary" className="font-mono">{doc.notificationCount}</Badge>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {sortedDocs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                No documents found in vault.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
