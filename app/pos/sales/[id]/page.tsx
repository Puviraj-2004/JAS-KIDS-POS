import { SaleDetail } from "@/components/pos/SaleDetail";

export default function SalePage({ params }: { params: { id: string } }) { return <SaleDetail saleId={params.id}/>; }
