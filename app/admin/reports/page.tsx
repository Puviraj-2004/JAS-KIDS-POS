import { ReportsDashboard } from "@/components/admin/ReportsDashboard";
import styles from "../admin.module.css";

export default function ReportsPage(){return <main className={styles.page}><div className={styles.shell}><header className={styles.header}><p>MANAGEMENT REPORTING</p><h1>Reports</h1><span>Review overall income, expenses, net revenue, booking revenue, cafe revenue, wastage, and supplier purchase cost.</span></header><ReportsDashboard/></div></main>}
