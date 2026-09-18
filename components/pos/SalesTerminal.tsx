"use client";
import { DiscountFields } from "@/components/pos/DiscountFields";
import { previewPricing, discountLabel, lineAmount, sumAmounts, type DiscountType } from "@/lib/pricing";

import { ArrowLeft, ArrowRight, ClipboardList, Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import styles from "@/app/pos/sales/sales.module.css";

type Branch = { id: string; name: string };
type Product = { id: string; stock_batch_id: string; product_id: string; name: string; selling_price: string; buying_price: string; quantity: string; category: { id: string; name: string } };
type Payload = { selected_branch: Branch; branches: Branch[]; products: Product[] };
const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });

export function SalesTerminal() {
  const router = useRouter();
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [branchId, setBranchId] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [discountType, setDiscountType] = useState<DiscountType>("NONE");
  const [checkoutKey, setCheckoutKey] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [mobileCart, setMobileCart] = useState(false);
  const load = useCallback(async (selected?: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/pos/sales" + (selected ? "?branch_id=" + encodeURIComponent(selected) : ""), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Products could not be loaded");
      setData(payload); setBranchId(payload.selected_branch.id); setCart({});
      setDiscount("0"); setDiscountType("NONE"); setCheckoutKey(""); setAmountReceived(""); setCategory("ALL"); setMobileCart(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Products could not be loaded"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const categories = useMemo(() => Array.from(new Set(data?.products.map(product => product.category.name) ?? [])), [data]);
  const products = useMemo(() => data?.products.filter(product => (category === "ALL" || product.category.name === category) && product.name.toLowerCase().includes(search.toLowerCase())) ?? [], [data, category, search]);
  const lines = useMemo(() => data?.products.filter(product => cart[product.id]).map(product => ({ product, quantity: cart[product.id], lineTotal: lineAmount(product.selling_price, cart[product.id].toFixed(3)) })) ?? [], [data, cart]);
  const subtotal = sumAmounts(lines.map(line => line.lineTotal));
  const pricing = previewPricing(subtotal, discountType, discount);
  const discountNumber = pricing.discount;
  const total = pricing.total;
  useEffect(() => { setCheckoutKey(crypto.randomUUID()); }, [cart, discountType, discount, amountReceived, paymentMethod, branchId]);
  const received = amountReceived === "" ? total : Math.max(0, Number(amountReceived) || 0);
  function change(product: Product, difference: number) {
    if (submitting || loading) return;
    setCart(current => {
      const next = Math.max(0, Math.min(Number(product.quantity), (current[product.id] ?? 0) + difference));
      if (!next) { const copy = { ...current }; delete copy[product.id]; return copy; }
      return { ...current, [product.id]: next };
    });
  }
  async function changeBranch(selected: string) {
    if (lines.length && !await confirm({ title: "Change sales branch?", description: "The current cart will be cleared.", confirmLabel: "Change branch" })) return;
    void load(selected);
  }
  async function clearCart() {
    if (!await confirm({ title: "Clear current sale?", description: "All items and the discount will be removed from this cart.", confirmLabel: "Clear cart", danger: true })) return;
    setCart({}); setDiscount("0"); setDiscountType("NONE"); setCheckoutKey(""); setAmountReceived(""); setError("");
  }
  async function checkout() {
    if (!data || !lines.length || submitting || loading) return;
    if (pricing.error) { setError(pricing.error); return; }
    if (discountNumber > subtotal) { setError("Discount cannot exceed the subtotal."); return; }
    if (received < total) { setError("Amount received cannot be less than the total."); return; }
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/pos/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branch_id: branchId, items: lines.map(line => ({ stock_batch_id: line.product.stock_batch_id, quantity: line.quantity })), discount_type: discountType, discount_value: discount, amount_received: received, payment_method: paymentMethod, idempotency_key: checkoutKey }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Sale could not be completed");
      router.push("/pos/sales/" + payload.sale_id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sale could not be completed"); setSubmitting(false); }
  }
  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.title}><div><p>COUNTER</p><h1>New sale</h1><span>Select products, review the cart, then collect payment.</span></div><div className={styles.titleActions}><Link href="/pos/sales"><ClipboardList size={17} aria-hidden="true" />Sales Records</Link>{data && data.branches.length > 1 && <label>Sales branch<select value={branchId} disabled={loading || submitting} onChange={event => void changeBranch(event.target.value)}>{data.branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label>}</div></header>
    {error && !mobileCart && <p className={styles.error} role="alert">{error} {!data && <button onClick={() => void load(branchId)}>Retry</button>}</p>}
    <div className={styles.terminal + (mobileCart ? " " + styles.reviewing : "")}>
      <section className={styles.catalog} aria-busy={loading}>
        <div className={styles.filters}><label className={styles.search}><Search size={18} aria-hidden="true"/><span className={styles.srOnly}>Search products</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search products"/>{search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")}>×</button>}</label>
          <div className={styles.categories} aria-label="Product categories"><button aria-pressed={category === "ALL"} className={category === "ALL" ? styles.selected : ""} onClick={() => setCategory("ALL")}>All products</button>{categories.map(item => <button aria-pressed={category === item} className={category === item ? styles.selected : ""} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
        </div>
        {loading ? <p className={styles.state} role="status">Loading products…</p> : products.length === 0 ? <div className={styles.state}><ShoppingCart size={28} aria-hidden="true"/><strong>No products found</strong><p>Try another search or category. Only available branch stock is shown.</p></div> : <><div className={styles.resultCount}>{products.length} stock batches available</div><div className={styles.products}>{products.map(product => <button className={styles.product} key={product.id} disabled={submitting || (cart[product.id] ?? 0) >= Number(product.quantity)} onClick={() => change(product, 1)}><span>{product.category.name}</span><strong>{product.name}</strong><small>{Number(product.quantity)} in stock at this price</small><b>{money.format(Number(product.selling_price))}</b><span className={styles.addMark}>{cart[product.id] ? cart[product.id] : <Plus size={16} aria-hidden="true"/>}</span></button>)}</div></>}
      </section>
      <aside className={styles.cart} aria-label="Current sale">
        <button className={styles.backToProducts} onClick={() => setMobileCart(false)} disabled={submitting}><ArrowLeft size={16} aria-hidden="true"/>Back to products</button>
        <div className={styles.cartTitle}><ShoppingCart size={18} aria-hidden="true"/><div><h2>Current sale</h2><p aria-live="polite">{lines.length} product{lines.length === 1 ? "" : "s"}</p></div>{lines.length > 0 && <button onClick={() => void clearCart()} disabled={submitting || loading} aria-label="Clear cart">Clear</button>}</div>
        {lines.length === 0 ? <div className={styles.emptyCart}><ShoppingCart size={28} aria-hidden="true"/><strong>Your cart is empty</strong><p>Select a product to start a sale.</p></div> : <div className={styles.lines}>{lines.map(({ product, quantity, lineTotal }) => <div className={styles.line} key={product.id}><div><strong>{product.name}</strong><small>{money.format(Number(product.selling_price))} each</small></div><b>{money.format(lineTotal)}</b><div className={styles.quantity}><button disabled={submitting} aria-label={"Remove one " + product.name} onClick={() => change(product, -1)}><Minus size={15} aria-hidden="true"/></button><span>{quantity}</span><button aria-label={"Add one " + product.name} onClick={() => change(product, 1)} disabled={submitting || quantity >= Number(product.quantity)}><Plus size={15} aria-hidden="true"/></button><button className={styles.trash} disabled={submitting} aria-label={"Remove " + product.name + " from cart"} onClick={() => setCart(current => { const copy = { ...current }; delete copy[product.id]; return copy; })}><Trash2 size={15} aria-hidden="true"/></button></div></div>)}</div>}
        <form className={styles.checkout} onSubmit={event => { event.preventDefault(); void checkout(); }}>
          <fieldset disabled={!lines.length || submitting || loading}><div className={styles.paymentFields}><DiscountFields type={discountType} value={discount} subtotal={subtotal} error={pricing.error} onTypeChange={setDiscountType} onValueChange={setDiscount} /><label>Payment method<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="CARD">Card</option><option value="UPI">UPI</option><option value="ONLINE">Online</option></select></label></div><label>Amount received · LKR<input type="number" min={total} step="0.01" value={amountReceived} onChange={event => setAmountReceived(event.target.value)} placeholder={total.toFixed(2)}/><small>Leave empty for the exact total.</small></label></fieldset>
          <dl><div><dt>Subtotal</dt><dd>{money.format(subtotal)}</dd></div>{discountNumber > 0 && <div><dt>{discountLabel(discountType, discount)}</dt><dd>−{money.format(discountNumber)}</dd></div>}<div className={styles.total}><dt>Total due</dt><dd>{money.format(total)}</dd></div><div><dt>Change to return</dt><dd>{money.format(Math.max(0, received - total))}</dd></div></dl>
          {error && mobileCart && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" className={styles.pay} disabled={!lines.length || submitting || loading || Boolean(pricing.error)}>{submitting ? "Completing sale…" : "Complete sale · " + money.format(total)}<ArrowRight size={17} aria-hidden="true"/></button>
        </form>
      </aside>
    </div>
    {!mobileCart && <div className={styles.mobileSummary}><div><small>{lines.length} products</small><strong>{money.format(total)}</strong></div><button disabled={!lines.length || loading} onClick={() => setMobileCart(true)}>Review cart<ArrowRight size={16} aria-hidden="true"/></button></div>}
  </div></main>;
}
