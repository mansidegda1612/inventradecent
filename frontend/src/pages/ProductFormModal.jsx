/**
 * ProductFormModal
 *
 * A headless forwardRef component — no DataGrid, no PageHeader.
 * Exposes three methods via ref:
 *   ref.current.openAdd()
 *   ref.current.openEdit(productRow)
 *   ref.current.openDelete(productRow)
 *
 * onSaved(action, row) is called after any successful operation:
 *   action: "add" | "edit" | "delete"
 *   row:    the affected product object (or { id } on delete)
 *
 * Usage in SaleEntry (dropdown footer buttons):
 *   const productFormRef = useRef(null);
 *   <ProductFormModal ref={productFormRef} onSaved={handleProductSaved} />
 *   // then in footerButtons:
 *   onClick: () => productFormRef.current?.openAdd()
 *
 * Usage in ProductMaster (full page):
 *   <ProductFormModal ref={productFormRef} onSaved={handleProductSaved} />
 */

import { useState, useRef, useImperativeHandle, forwardRef } from "react";
import { callAPI } from "../utils/callserver";
import {
  Btn,
  Modal,
  Field,
  Dropdown,
  ToastProvider,
  ConfirmModal,
} from "../components/ui/index";
import CategoryMaster from "./CategoryMaster";

const ProductFormModal = forwardRef(function ProductFormModal({ onSaved }, ref) {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null); // null = add mode, id = edit mode
  const [form, setForm] = useState(emptyForm());
  const [categoryData, setCategoryData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const categoryRef = useRef(null);

  // ── helpers ───────────────────────────────────────────────────────────────
  function emptyForm() {
    return { name: "", category: 0, barcode: "", gstPer: 5, sale_rate: 0, purc_rate: 0, o_qty: 0, hsn_code: "" ,lowstockqty : 0};
  }

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  const loadCategories = async () => {
    const res = await callAPI("categories", "GET");
    if (res.success) setCategoryData(res.data ?? []);
  };

  // ── exposed API ───────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    /** Open form in Add mode */
    async openAdd() {
      await loadCategories();
      const bcRes = await callAPI("products/generate-barcode", "GET");
      setForm({
        ...emptyForm(),
        barcode: bcRes.success ? bcRes.data.barcode : "",
      });
      setEdit(null);
      setModal(true);
    },

    /** Open form in Edit mode with an existing product row */
    async openEdit(row) {
      if (!row) return;
      await loadCategories();
      setForm({ ...emptyForm(), ...row });
      setEdit(row.id);
      setModal(true);
    },

    /** Open delete confirmation for a product row */
    openDelete(row) {
      if (!row) return;
      setDeleteTarget(row);
      setConfirmOpen(true);
    },
  }));

  // ── save (add / edit) ─────────────────────────────────────────────────────
  const save = async () => {
    if (!form.name) { show("Name is required!", "error"); return; }
    if (!form.barcode) { show("Barcode is required!", "error"); return; }

    const model = {
      name: form.name,
      category: form.category,
      purc_rate: parseFloat(form.purc_rate),
      sale_rate: parseFloat(form.sale_rate),
      hsn_code: form.hsn_code,
      barcode: form.barcode,
      gstPer: form.gstPer,
      o_qty: parseFloat(form.o_qty),
      lowstockqty : parseFloat(form.lowstockqty)
    };

    try {
      setLoading(true);
      const res = edit
        ? await callAPI(`products/${edit}`, "PUT", model)
        : await callAPI("products", "POST", model);

      show(res.message, res.success ? "success" : "error");
      if (res.success) {
        setModal(false);
        onSaved?.(edit ? "edit" : "add", { ...model, id: edit ?? res.data?.id });
      }
    } catch (err) {
      show(`Error ${edit ? "updating" : "creating"} product`, "error");
    } finally {
      setLoading(false);
    }
  };

  // ── delete ────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setLoading(true);
      const res = await callAPI(`products/${deleteTarget.id}`, "DELETE");
      show(res.message, res.success ? "success" : "error");
      if (res.success) {
        onSaved?.("delete", deleteTarget);
      }
    } catch (err) {
      show("Error deleting product", "error");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
      setDeleteTarget(null);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Add / Edit modal */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={edit ? "Edit Product" : "Add Product"}
        width={600}
      >
        <div className="form-grid-2">
          <Field label="Product Name" required>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Category">
            <Dropdown
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              clearable
              options={categoryData}
              footerButtons={[
                {
                  icon: "+", label: "Add", hotkey: "ctrl+a",
                  onClick: () => categoryRef.current?.openAdd(),
                },
                {
                  icon: "⬇", label: "Edit", hotkey: "ctrl+e",
                  onClick: (idx, focused) => {
                    if (focused) categoryRef.current?.openEdit(focused);
                  },
                },
                {
                  icon: "🗑", label: "Delete", hotkey: "ctrl+d",
                  onClick: (idx, focused) => {
                    if (focused) categoryRef.current?.openDelete(focused);
                  },
                },
              ]}
            />
          </Field>
        </div>

        <div className="form-grid-21">
          <Field label="Barcode" required>
            <input
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            />
          </Field>
          <Field label="GST %">
            <Dropdown
              value={form.gstPer}
              onChange={(v) => setForm({ ...form, gstPer: v })}
              clearable
              options={[
                { id: 0,  name: "Not Applicable (0%)" },
                { id: 5,  name: "5%"  },
                { id: 12, name: "12%" },
                { id: 18, name: "18%" },
                { id: 28, name: "28%" },
              ]}
            />
          </Field>
        </div>

        <div className="form-grid-2">
          
          <Field label="Purchase Rate (₹)" required>
            <input
              type="number"
              value={form.purc_rate}
              onChange={(e) => setForm({ ...form, purc_rate: e.target.value })}
            />
          </Field>
          <Field label="Sale Rate (₹)" required>
            <input
              type="number"
              value={form.sale_rate}
              onChange={(e) => setForm({ ...form, sale_rate: e.target.value })}
            />
          </Field>
        </div>

        <div className="form-grid-2">
          <Field label="HSN Code">
            <input
              value={form.hsn_code}
              onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
            />
          </Field>
          <Field label="Low stock Qty">
            <input
              value={form.lowstockqty}
              onChange={(e) => setForm({ ...form, lowstockqty: e.target.value })}
            />
          </Field>
        </div>
        <div>
          <Field label="Opening Qty">
            <input
              type="number"
              value={form.o_qty}
              onChange={(e) => setForm({ ...form, o_qty: e.target.value })}
            />
          </Field>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>
            Cancel
          </Btn>
          <Btn onClick={save} disabled={loading}>
            {loading ? "Saving…" : "Save Product"}
          </Btn>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => { setConfirmOpen(false); setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}"?`}
      />

      {/* Nested category manager (headless, same pattern) */}
      <CategoryMaster ref={categoryRef} onSaved={loadCategories} />

      {/* Toasts */}
      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </>
  );
});

export default ProductFormModal;