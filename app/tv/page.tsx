import { LiveTvScreen } from "@/components/tv/LiveTvScreen";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Playhouse TV | JAS Kids POS",
  description: "Live countdown board for active Playhouse sessions",
};

export const dynamic = "force-dynamic";

export default async function TvPage({
  searchParams,
}: {
  searchParams: Promise<{ branch_id?: string; branch?: string }>;
}) {
  const params = await searchParams;
  const initialBranchId = params.branch_id || params.branch;

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#070c09" }}>
      <LiveTvScreen initialBranchId={initialBranchId} />
    </main>
  );
}
