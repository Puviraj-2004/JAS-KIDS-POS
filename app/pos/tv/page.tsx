import { redirect } from "next/navigation";

export default async function PosTvPage({
  searchParams,
}: {
  searchParams: Promise<{ branch_id?: string; branch?: string }>;
}) {
  const params = await searchParams;
  const branchParam = params.branch_id || params.branch;
  if (branchParam) {
    redirect(`/tv?branch_id=${encodeURIComponent(branchParam)}`);
  }
  redirect("/tv");
}
