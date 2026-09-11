import { SaleDetail } from "@/components/pos/SaleDetail";

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleDetail saleId={id}/>;
}
