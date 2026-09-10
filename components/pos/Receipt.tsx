import styles from "./Receipt.module.css";

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });

type BaseProps = {
  receiptNo: string;
  branchName: string;
  branchAddress?: string | null;
  branchPhone?: string | null;
  servedBy: string;
  issuedAt: string | Date;
};

function shortBranchName(name: string) {
  return name.replace(/^JAS\s*KIDS\s+/i, "").trim() || name;
}

function Header({ receiptNo, branchName, branchAddress, branchPhone, issuedAt }: BaseProps) {
  return <><img className={styles.logo} src="/Jaskids_Logo.png" alt="JAS Kids"/><h1>JAS Kids</h1><p className={styles.branch}>{shortBranchName(branchName)}</p><div className={styles.rule}/><dl><div><dt>Receipt</dt><dd>{receiptNo}</dd></div><div><dt>Date</dt><dd>{new Date(issuedAt).toLocaleDateString("en-GB")}</dd></div><div><dt>Time</dt><dd>{new Date(issuedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</dd></div></dl></>;
}

function Footer() {
  return <><div className={styles.rule}/><p className={styles.thanks}>Thank you!</p></>;
}

function bookingTypeLabel(value: string) {
  if (value === "ONLINE_PLAYHOUSE") return "Online Playhouse";
  if (value === "WALKIN_PLAYHOUSE") return "Walk-in Playhouse";
  if (value === "ONLINE_BIRTHDAY") return "Online Birthday";
  if (value === "WALKIN_BIRTHDAY") return "Walk-in Birthday";
  return "Booking";
}

export function BookingReceipt(props: BaseProps & {
  referenceNo: string;
  bookingType: string;
  serviceName?: string | null;
  slotName?: string | null;
  items?: Array<{ id: string; product_name: string; quantity: string | number; unit_price: string | number; line_total: string | number }>;
  childCount: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  total: number;
  paidBefore: number;
  collectedNow: number;
  paymentMethod: string;
  paymentStatus: string;
}) {
  const paid = props.paidBefore + props.collectedNow;
  const balance = Math.max(0, props.total - paid);
  return <article className={styles.receipt} data-print-receipt>
    <Header {...props}/><h2>BOOKING RECEIPT</h2><dl>
      <div><dt>Booking</dt><dd>{bookingTypeLabel(props.bookingType)}</dd></div><div><dt>Ref</dt><dd>{props.referenceNo}</dd></div>
      <div><dt>Date</dt><dd>{new Date(`${props.bookingDate}T00:00:00`).toLocaleDateString("en-GB")}</dd></div><div><dt>Time</dt><dd>{props.startTime.slice(0,5)}–{props.endTime.slice(0,5)}</dd></div>
      <div><dt>Children</dt><dd>{props.childCount}</dd></div>
    </dl>{props.items && props.items.length > 0 ? <><div className={styles.rule}/><table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>{props.items.map(item => <tr key={item.id}><td>{item.product_name}<small>{Number(item.quantity)} × {money.format(Number(item.unit_price))}</small></td><td>{Number(item.quantity)}</td><td>{money.format(Number(item.line_total))}</td></tr>)}</tbody></table></> : <><div className={styles.rule}/><dl><div><dt>Item</dt><dd>{props.serviceName || props.slotName || "Play session"}</dd></div></dl></>}<div className={styles.rule}/><dl className={styles.totals}>
      <div className={styles.grand}><dt>Total</dt><dd>{money.format(props.total)}</dd></div><div><dt>Paid</dt><dd>{money.format(paid)}</dd></div><div><dt>Balance</dt><dd>{money.format(balance)}</dd></div><div><dt>Method</dt><dd>{props.paymentMethod.replaceAll("_", " ")}</dd></div>
    </dl><Footer/>
  </article>;
}

export function SaleReceipt(props: BaseProps & {
  saleNo: string;
  status: string;
  items: Array<{ id: string; product_name: string; quantity: string | number; unit_price: string | number; line_total: string | number }>;
  subtotal: string | number;
  discount: string | number;
  total: string | number;
  amountReceived: string | number;
  changeGiven: string | number;
  paymentMethod: string;
}) {
  return <article className={styles.receipt} data-print-receipt>
    <Header {...props}/><h2>SALES RECEIPT</h2><dl><div><dt>Sale No</dt><dd>{props.saleNo}</dd></div><div><dt>Status</dt><dd>{props.status.replaceAll("_", " ")}</dd></div></dl>
    <div className={styles.rule}/><table><thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead><tbody>{props.items.map(item => <tr key={item.id}><td>{item.product_name}<small>{Number(item.quantity)} × {money.format(Number(item.unit_price))}</small></td><td>{Number(item.quantity)}</td><td>{money.format(Number(item.line_total))}</td></tr>)}</tbody></table>
    <div className={styles.rule}/><dl className={styles.totals}><div><dt>Subtotal</dt><dd>{money.format(Number(props.subtotal))}</dd></div>{Number(props.discount) > 0 && <div><dt>Discount</dt><dd>−{money.format(Number(props.discount))}</dd></div>}<div className={styles.grand}><dt>Total</dt><dd>{money.format(Number(props.total))}</dd></div><div><dt>Paid</dt><dd>{money.format(Number(props.amountReceived))}</dd></div><div><dt>Change</dt><dd>{money.format(Number(props.changeGiven))}</dd></div><div><dt>Method</dt><dd>{props.paymentMethod.replaceAll("_", " ")}</dd></div></dl>
    <Footer/>
  </article>;
}
