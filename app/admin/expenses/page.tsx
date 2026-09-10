import { AccountsManager } from "@/components/admin/AccountsManager";
import styles from "../admin.module.css";

export default function ExpensesPage() {
  return <main className={styles.page}><div className={styles.shell}><header className={styles.header}><p>EXPENSE CONTROL</p><h1>Expenses</h1><span>Track branch expenses with simple expense type management.</span></header><AccountsManager/></div></main>;
}
