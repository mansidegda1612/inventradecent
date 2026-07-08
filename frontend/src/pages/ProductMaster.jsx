/**
 * ProductMaster  (full-page view with DataGrid)
 *
 * Uses ProductFormModal for all Add / Edit / Delete UI.
 * No form logic lives here — just the grid + wiring.
 */

import { useState, useRef } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import {
  Btn, Card, PageHeader, DataGrid, ToastProvider,
} from "../components/ui/index";
import { callAPI } from "../utils/callserver";
import ProductFormModal from "./ProductFormModal"; // ← the new headless component

export default function ProductMaster() {
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });

  const loadModelRef = useRef({});
  const productFormRef = useRef(null); // ref to ProductFormModal

  // ── toast ─────────────────────────────────────────────────────────────────
  const show = (msg, type = "success") => {
    setToasts({ open: true, msg, type });
    setTimeout(() => setToasts({ open: false }), 3000);
  };

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchProducts = async (loadModel) => {
    try {
      loadModelRef.current = loadModel;
      let url = `products?page=${loadModel.page}&limit=${loadModel.pageSize}`;
      if (loadModel.search) url += `&search=${loadModel.search}`;
      setLoading(true);
      const res = await callAPI(url, "GET");
      if (loadModel.exportAll) {
        return res?.data;
      }
      else {
        setList(res?.data ?? []);
        setTotal(res?.pagination?.total ?? 0);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── called by ProductFormModal after add / edit / delete ──────────────────
  const handleProductSaved = (action, row) => {
    // Re-fetch the grid to reflect the change
    fetchProducts(loadModelRef.current);
    const labels = { add: "Product added", edit: "Product updated", delete: "Product deleted" };
    show(labels[action] ?? "Saved");
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader title="Product Master" sub="Manage your product catalogue." />

      <Card noPad>
        <DataGrid
          title=""
          columns={[
            {
              key: "name",
              label: "Product Name",
              render: (value) => (
                <span className="u-text u-bold">{value}</span>
              ),
            },
            { key: "category_name", label: "Category" },
            { key: "barcode", label: "Barcode" },
            {
              key: "gstPer",
              label: "GST %",
              render: (value) => <span>{value}%</span>,
            },
            { key: "sale_rate", label: "Sale Rate" },
            { key: "purc_rate", label: "Purc Rate" },
            { key: "o_qty", label: "Opening Qty" },
          ]}
          data={list}
          lazy
          total={total}
          loading={loading}
          onFetch={fetchProducts}
          HeaderButtons={[
            {
              key: "add",
              label: "Add Product",
              icon: "+",
              variant: "primary",
              hotkey: "ctrl+a",
              onClick: () => productFormRef.current?.openAdd(),
            },
          ]}
          footerButtons={[
            {
              key: "edit",
              label: "Edit",
              icon: "⬇",
              hotkey: "ctrl+e",
              onClick: (ids, all, focused) => productFormRef.current?.openEdit(focused),
            },
            {
              key: "del",
              label: "Delete",
              icon: "🗑",
              variant: "danger",
              hotkey: "ctrl+d",
              onClick: (ids, all, focused) => productFormRef.current?.openDelete(focused),
            },
          ]}
        />
      </Card>

      {/* Headless form modal — handles add/edit/delete UI */}
      <ProductFormModal ref={productFormRef} onSaved={handleProductSaved} />

      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} />
    </div>
  );
}