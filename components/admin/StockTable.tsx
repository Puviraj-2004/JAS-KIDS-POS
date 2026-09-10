"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import styles from "./Operations.module.css";

type Branch = { id: string; name: string };
type StockView = "products" | "services" | "packages" | "stock" | "waste" | "movements";
type Product = { id: string; name: string; item_category: string; selling_price: string | null; branch_id: string | null; branch: Branch | null };
type Supplier = { id: string; name: string };
type Inventory = { id: string; quantity: string; branch: Branch; product: Product };
type StockBatch = {
  id: string;
  quantity_remaining: string;
  buying_price: string;
  selling_price: string;
  branch: Branch;
  product: Product;
  supplier_purchase_item?: { purchase: { supplier: Supplier } } | null;
};
type Movement = { id: string; type: string; quantity: string; note: string | null; created_at: string; branch: Branch; product: Product; staff: { name: string } };
type StockData = { can_manage: boolean; can_add_stock: boolean; can_record_waste: boolean; can_manage_catalogue: boolean; can_select_branch: boolean; selected_branch_id: string | null; products: Product[]; suppliers: Supplier[]; branches: Branch[]; inventory: Inventory[]; stock_batches: StockBatch[]; movements: Movement[] };

const money = new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" });
const stockCategories = new Set(["CAFE_ITEM", "BIRTHDAY_ITEM", "OTHER_ITEM"]);
const categoryOptions = [
  { value: "CAFE_ITEM", label: "Cafe item", group: "Product" },
  { value: "BIRTHDAY_ITEM", label: "Birthday item", group: "Product" },
  { value: "OTHER_ITEM", label: "Other item", group: "Product" },
  { value: "SERVICE_ITEM", label: "Service item", group: "Service" },
  { value: "BIRTHDAY_PACKAGE", label: "Birthday package", group: "Package" },
  { value: "PLAYHOUSE_PACKAGE", label: "Playhouse package", group: "Package" },
  { value: "OTHER_PACKAGE", label: "Other package", group: "Package" },
];

function categoryName(category: string) {
  return categoryOptions.find(option => option.value === category)?.label ?? category;
}

function categoryGroup(category: string) {
  return categoryOptions.find(option => option.value === category)?.group ?? "Item";
}

function isStockCategory(category: string) {
  return stockCategories.has(category);
}

export function StockTable({ visibleViews }: { initialView?: StockView; visibleViews?: StockView[] }) {
  const confirm = useConfirm();
  const catalogueMode = !!visibleViews && visibleViews.every(view => ["products", "services", "packages"].includes(view));
  const [data, setData] = useState<StockData | null>(null);
  const [branchId, setBranchId] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [itemCategory, setItemCategory] = useState("CAFE_ITEM");
  const [editing, setEditing] = useState<Product | null>(null);
  const [catalogueModalOpen, setCatalogueModalOpen] = useState(false);
  const [stockModal, setStockModal] = useState<"add" | "waste" | "edit" | null>(null);
  const [editingBatch, setEditingBatch] = useState<StockBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (selected = branchId) => {
    setError("");
    try {
      const response = await fetch(`/api/admin/stock${selected ? `?branch_id=${encodeURIComponent(selected)}` : ""}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Inventory could not be loaded");
      setData(payload);
      if (payload.selected_branch_id) setBranchId(payload.selected_branch_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Inventory could not be loaded");
    }
  }, [branchId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const products = useMemo(() => data?.products.filter(item => stockCategories.has(item.item_category)) ?? [], [data]);
  const filteredStockProducts = useMemo(() => products.filter(item => !categoryFilter || item.item_category === categoryFilter), [products, categoryFilter]);
  const services = useMemo(() => data?.products.filter(item => item.item_category === "SERVICE_ITEM") ?? [], [data]);
  const packages = useMemo(() => data?.products.filter(item => item.item_category.endsWith("_PACKAGE")) ?? [], [data]);
  const catalogueItems = useMemo(() => data?.products.filter(item => !categoryFilter || item.item_category === categoryFilter) ?? [], [data, categoryFilter]);
  const displayBatches = useMemo(() => (data?.stock_batches ?? []).filter(batch => Number(batch.quantity_remaining) > 0 && (!categoryFilter || batch.product.item_category === categoryFilter)), [data, categoryFilter]);
  const displayMovements = useMemo(() => (data?.movements ?? []).filter(item => !categoryFilter || item.product.item_category === categoryFilter), [data, categoryFilter]);
  const currentValue = displayBatches.reduce((sum, batch) => sum + Number(batch.quantity_remaining) * Number(batch.buying_price), 0);
  const salesValue = displayBatches.reduce((sum, batch) => sum + Number(batch.quantity_remaining) * Number(batch.selling_price), 0);

  async function post(url: string, payload: Record<string, unknown>, success: string) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Stock could not be updated");
      setMessage(success);
      await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Stock could not be updated");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitCatalogue(event: FormEvent<HTMLFormElement>, payload: Record<string, unknown>, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const ok = await post("/api/admin/stock", payload, success);
    if (ok) {
      setEditing(null);
      setCatalogueModalOpen(false);
      form.reset();
    }
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    await submitCatalogue(event, { action: editing ? "update_product" : "create_product", id: editing?.id, name: form.get("name"), item_category: itemCategory, selling_price: form.get("selling_price") }, editing ? "Item updated." : "Item created.");
  }

  async function deleteItem(product: Product) {
    if (!await confirm({ title: "Delete item?", description: `${product.name} will be hidden from future use. Existing records stay safe.`, confirmLabel: "Delete item", danger: true })) return;
    await post("/api/admin/stock", { action: "delete_product", id: product.id }, "Item deleted.");
  }

  async function submitAddStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await post("/api/admin/suppliers", {
      action: "create_purchase",
      supplier_id: form.get("supplier_id"),
      items: [{ product_id: form.get("product_id"), quantity: form.get("quantity"), unit_cost: form.get("buying_price"), selling_price: form.get("selling_price") }],
      amount_paid: form.get("amount_paid"),
      payment_method: form.get("payment_method"),
      note: form.get("note"),
    }, "Stock added and purchase recorded.");
    if (ok) {
      formElement.reset();
      setStockModal(null);
    }
  }

  async function submitEditStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBatch) return;
    const form = new FormData(event.currentTarget);
    const ok = await post("/api/admin/stock", {
      action: "update_stock_batch",
      stock_batch_id: editingBatch.id,
      quantity: form.get("quantity"),
      buying_price: form.get("buying_price"),
      selling_price: form.get("selling_price"),
      note: form.get("note"),
    }, "Stock updated.");
    if (ok) {
      setEditingBatch(null);
      setStockModal(null);
    }
  }

  async function submitWastage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const ok = await post("/api/admin/stock", { action: "wastage", branch_id: data?.selected_branch_id, stock_batch_id: form.get("stock_batch_id"), quantity: form.get("quantity"), note: form.get("note") }, "Wastage recorded.");
    if (ok) {
      formElement.reset();
      setEditingBatch(null);
      setStockModal(null);
    }
  }

  function beginAdd() {
    setEditing(null);
    setItemCategory(categoryFilter || "CAFE_ITEM");
    setCatalogueModalOpen(true);
  }

  function beginEdit(product: Product) {
    setEditing(product);
    setItemCategory(product.item_category);
    setCatalogueModalOpen(true);
  }

  if (!data) return <p className={error ? styles.error : styles.empty} role={error ? "alert" : "status"}>{error || "Loading inventory…"}</p>;

  if (catalogueMode) {
    return <div className={styles.layout}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          {data.can_select_branch && <label>Branch<select value={branchId} onChange={event => { setBranchId(event.target.value); void load(event.target.value); }}><option value="">All branches</option>{data.branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
          <label>Category<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categoryOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        {data.can_manage_catalogue && <button className={styles.button} type="button" onClick={beginAdd}>Add Item</button>}
      </div>

      <section className={styles.summary}>
        <div className={styles.metric}><strong>{products.length}</strong><span>Products</span></div>
        <div className={styles.metric}><strong>{services.length}</strong><span>Services</span></div>
        <div className={styles.metric}><strong>{packages.length}</strong><span>Packages</span></div>
      </section>

      {(error || message) && <p role={error ? "alert" : "status"} className={error ? styles.error : styles.notice}>{error || message}</p>}

      <section className={styles.card}>
        <div className={styles.cardHeader}><div><h2>Items, services, and packages</h2><p>{data.can_manage_catalogue ? "Manage the catalogue for your assigned branch." : "View catalogue details across branches."}</p></div></div>
        {catalogueItems.length === 0 ? <p className={styles.empty}>No catalogue records found.</p> : <CatalogueTable items={catalogueItems} canManage={data.can_manage_catalogue} busy={busy} beginEdit={beginEdit} deleteItem={deleteItem} />}
      </section>

      {catalogueModalOpen && <CatalogueModal editing={editing} itemCategory={itemCategory} busy={busy} setItemCategory={setItemCategory} close={() => { setCatalogueModalOpen(false); setEditing(null); }} submitItem={submitItem} />}
    </div>;
  }

  return <div className={styles.layout}>
    <div className={styles.toolbar}>
      <div className={styles.filters}>
        <label>Category<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">All stock categories</option>{categoryOptions.filter(option => stockCategories.has(option.value)).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      </div>
      <div className={styles.actions}>
        {data.can_add_stock && <button className={styles.button} type="button" onClick={() => setStockModal("add")}>Add Stock</button>}
        {data.can_record_waste && <button className={styles.secondary} type="button" onClick={() => setStockModal("waste")}>Record Wastage</button>}
      </div>
    </div>

    <section className={styles.summary}>
      <div className={styles.metric}><strong>{displayBatches.length}</strong><span>Available stock batches</span></div>
      <div className={styles.metric}><strong>{money.format(currentValue)}</strong><span>Stock buying value</span></div>
      <div className={styles.metric}><strong>{money.format(salesValue)}</strong><span>Stock selling value</span></div>
    </section>

    {(error || message) && <p role={error ? "alert" : "status"} className={error ? styles.error : styles.notice}>{error || message}</p>}

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><h2>Current available stock</h2><p>Only stock with quantity above zero is shown here.</p></div></div>
      {displayBatches.length === 0 ? <p className={styles.empty}>No available stock in this branch.</p> : <StockBatchTable batches={displayBatches} canEdit={data.can_add_stock} canWaste={data.can_record_waste} busy={busy} editStock={(batch) => { setEditingBatch(batch); setStockModal("edit"); }} wasteStock={(batch) => { setEditingBatch(batch); setStockModal("waste"); }} />}
    </section>

    <section className={styles.card}>
      <div className={styles.cardHeader}><div><h2>Recent stock activity</h2><p>Latest stock additions, sales, edits, and wastage records.</p></div></div>
      <MovementTable movements={displayMovements} />
    </section>

    {stockModal === "add" && <AddStockModal products={filteredStockProducts} suppliers={data.suppliers} busy={busy} close={() => setStockModal(null)} submit={submitAddStock} />}
    {stockModal === "edit" && editingBatch && <EditStockModal batch={editingBatch} busy={busy} close={() => { setEditingBatch(null); setStockModal(null); }} submit={submitEditStock} />}
    {stockModal === "waste" && <WasteModal batches={displayBatches} selectedBatch={editingBatch} busy={busy} close={() => { setEditingBatch(null); setStockModal(null); }} submit={submitWastage} />}
  </div>;
}

function CatalogueTable({ items, canManage, busy, beginEdit, deleteItem }: { items: Product[]; canManage: boolean; busy: boolean; beginEdit: (product: Product) => void; deleteItem: (product: Product) => void }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Name</th><th>Category</th><th>Branch</th><th data-numeric>Price</th><th>Actions</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td data-label="Name"><strong>{item.name}</strong><small>{categoryGroup(item.item_category)}</small></td><td data-label="Category">{categoryName(item.item_category)}</td><td data-label="Branch">{item.branch?.name ?? "—"}</td><td data-label="Price" data-numeric>{isStockCategory(item.item_category) ? "Stock batch price" : money.format(Number(item.selling_price ?? 0))}</td><td data-label="Actions"><div className={styles.actions}>{canManage ? <><button className={styles.secondary} type="button" disabled={busy} onClick={() => beginEdit(item)}>Edit</button><button className={styles.danger} type="button" disabled={busy} onClick={() => void deleteItem(item)}>Delete</button></> : <span className={styles.status}>View only</span>}</div></td></tr>)}</tbody></table></div>;
}

function CatalogueModal(props: { editing: Product | null; itemCategory: string; busy: boolean; setItemCategory: (value: string) => void; close: () => void; submitItem: (event: FormEvent<HTMLFormElement>) => void }) {
  const selected = categoryOptions.find(option => option.value === props.itemCategory) ?? categoryOptions[0];
  const stockItem = isStockCategory(props.itemCategory);
  return <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="catalogue-modal-title"><div className={styles.modalHeader}><div><p>{props.editing ? "EDIT CATALOGUE" : "NEW CATALOGUE"}</p><h2 id="catalogue-modal-title">{props.editing ? props.editing.name : "Item details"}</h2></div><button type="button" onClick={props.close} disabled={props.busy} aria-label="Close item form">×</button></div><form key={props.editing?.id ?? "new"} className={styles.form} onSubmit={props.submitItem}><label>Category<select value={props.itemCategory} onChange={event => props.setItemCategory(event.target.value)}>{categoryOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>{selected.group} name<input name="name" required autoFocus defaultValue={props.editing?.name ?? ""} /></label>{stockItem ? <p className={styles.empty}>Buying and selling prices are entered when receiving stock from a supplier.</p> : <label>{selected.group === "Package" ? "Package price" : "Service charge"}<input name="selling_price" type="number" min="0.01" step="0.01" required defaultValue={props.editing?.selling_price ?? ""} /></label>}<div className={styles.modalActions}><button type="button" onClick={props.close} disabled={props.busy}>Cancel</button><button className={styles.button} disabled={props.busy}>{props.busy ? "Saving…" : props.editing ? "Save" : "Create"}</button></div></form></section></div>;
}

function AddStockModal({ products, suppliers, busy, close, submit }: { products: Product[]; suppliers: Supplier[]; busy: boolean; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="add-stock-title"><div className={styles.modalHeader}><div><p>ADD STOCK</p><h2 id="add-stock-title">Receive stock</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Close add stock form">×</button></div><form className={styles.form} onSubmit={submit}><label>Product<select name="product_id" required autoFocus defaultValue=""><option value="" disabled>Select product</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Supplier<select name="supplier_id" required defaultValue=""><option value="" disabled>Select supplier</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><div className={styles.formRow}><label>Quantity<input name="quantity" type="number" min="0.001" step="0.001" required /></label><label>Buying price<input name="buying_price" type="number" min="0.01" step="0.01" required /></label></div><div className={styles.formRow}><label>Selling price<input name="selling_price" type="number" min="0.01" step="0.01" required /></label><label>Amount paid now<input name="amount_paid" type="number" min="0" step="0.01" defaultValue="0" required /></label></div><label>Payment method<select name="payment_method" defaultValue="CASH"><option value="CASH">Cash</option><option value="CARD">Card</option><option value="UPI">UPI</option><option value="ONLINE">Online</option></select></label><label>Note<textarea name="note" placeholder="Optional" /></label><div className={styles.modalActions}><button type="button" onClick={close} disabled={busy}>Cancel</button><button className={styles.button} disabled={busy || products.length === 0 || suppliers.length === 0}>{busy ? "Saving…" : "Save stock"}</button></div></form></section></div>;
}

function EditStockModal({ batch, busy, close, submit }: { batch: StockBatch; busy: boolean; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="edit-stock-title"><div className={styles.modalHeader}><div><p>EDIT STOCK</p><h2 id="edit-stock-title">{batch.product.name}</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Close edit stock form">×</button></div><form className={styles.form} onSubmit={submit}><label>Current quantity<input name="quantity" type="number" min="0.001" step="0.001" required autoFocus defaultValue={batch.quantity_remaining} /></label><div className={styles.formRow}><label>Buying price<input name="buying_price" type="number" min="0.01" step="0.01" required defaultValue={batch.buying_price} /></label><label>Selling price<input name="selling_price" type="number" min="0.01" step="0.01" required defaultValue={batch.selling_price} /></label></div><label>Reason / note<textarea name="note" placeholder="Optional correction note" /></label><div className={styles.modalActions}><button type="button" onClick={close} disabled={busy}>Cancel</button><button className={styles.button} disabled={busy}>{busy ? "Saving…" : "Save stock"}</button></div></form></section></div>;
}

function WasteModal({ batches, selectedBatch, busy, close, submit }: { batches: StockBatch[]; selectedBatch: StockBatch | null; busy: boolean; close: () => void; submit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className={styles.modalBackdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="waste-title"><div className={styles.modalHeader}><div><p>RECORD WASTAGE</p><h2 id="waste-title">Waste stock</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Close wastage form">×</button></div><form className={styles.form} onSubmit={submit}><label>Stock<select name="stock_batch_id" required autoFocus defaultValue={selectedBatch?.id ?? ""}><option value="" disabled>Select stock</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.product.name} · {Number(batch.quantity_remaining)} left · buy {money.format(Number(batch.buying_price))}</option>)}</select></label><label>Waste quantity<input name="quantity" type="number" min="0.001" step="0.001" required /></label><label>Reason<textarea name="note" required placeholder="e.g. spoiled, damaged, expired by shop policy" /></label><div className={styles.modalActions}><button type="button" onClick={close} disabled={busy}>Cancel</button><button className={styles.danger} disabled={busy || batches.length === 0}>{busy ? "Saving…" : "Record wastage"}</button></div></form></section></div>;
}

function StockBatchTable({ batches, canEdit, canWaste, busy, editStock, wasteStock }: { batches: StockBatch[]; canEdit: boolean; canWaste: boolean; busy: boolean; editStock: (batch: StockBatch) => void; wasteStock: (batch: StockBatch) => void }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Product</th><th>Supplier</th><th>Category</th><th data-numeric>Available</th><th data-numeric>Buying</th><th data-numeric>Selling</th><th>Actions</th></tr></thead><tbody>{batches.map(batch => <tr key={batch.id}><td data-label="Product"><strong>{batch.product.name}</strong><small>{batch.branch.name}</small></td><td data-label="Supplier">{batch.supplier_purchase_item?.purchase.supplier.name ?? "—"}</td><td data-label="Category">{categoryName(batch.product.item_category)}</td><td data-label="Available" data-numeric>{Number(batch.quantity_remaining)}</td><td data-label="Buying" data-numeric>{money.format(Number(batch.buying_price))}</td><td data-label="Selling" data-numeric>{money.format(Number(batch.selling_price))}</td><td data-label="Actions"><div className={styles.actions}>{canEdit && <button className={styles.secondary} type="button" disabled={busy} onClick={() => editStock(batch)}>Edit</button>}{canWaste && <button className={styles.danger} type="button" disabled={busy} onClick={() => wasteStock(batch)}>Waste</button>}</div></td></tr>)}</tbody></table></div>;
}

function MovementTable({ movements }: { movements: Movement[] }) {
  return movements.length === 0 ? <p className={styles.empty}>No stock activity recorded.</p> : <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Type</th><th>Product</th><th data-numeric>Quantity</th><th>Staff</th><th>Note</th></tr></thead><tbody>{movements.map(item => <tr key={item.id}><td data-label="Date">{new Date(item.created_at).toLocaleString("en-GB")}</td><td data-label="Type"><span className={item.type === "WASTAGE" ? styles.low : styles.status}>{item.type.replaceAll("_", " ")}</span></td><td data-label="Product">{item.product.name}</td><td data-label="Quantity" data-numeric>{Number(item.quantity)}</td><td data-label="Staff">{item.staff.name}</td><td data-label="Note">{item.note || "—"}</td></tr>)}</tbody></table></div>;
}
