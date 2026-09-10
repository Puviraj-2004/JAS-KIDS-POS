import { StockTable } from "@/components/admin/StockTable";
import styles from "../pos.module.css";

export default function PosStockPage() {
  return <main className={styles.page}><div className={styles.shell}><header className={styles.hero}><p>STOCK & WASTE</p><h1>Branch stock</h1><span>Review stock and record wastage for your assigned branch.</span></header><StockTable initialView="stock" visibleViews={["stock", "waste", "movements"]}/></div></main>;
}
