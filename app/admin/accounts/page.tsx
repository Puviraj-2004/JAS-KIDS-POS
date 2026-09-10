import { AccountsManager } from "@/components/admin/AccountsManager";
import styles from "../admin.module.css";

export default function AccountsPage(){return <main className={styles.page}><div className={styles.shell}><header className={styles.header}><p>BRANCH ACCOUNTS</p><h1>Accounts</h1><span>Track operating income, costs, expenses, wastage, and supplier balances.</span></header><AccountsManager/></div></main>}
