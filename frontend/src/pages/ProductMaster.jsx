import { useState, useEffect,useRef } from "react";
import { C } from "../utils/theme";
import { fmt } from "../utils/format";
import { Btn, Card, Badge, Modal, Field, PageHeader, TableWrap, DataGrid, Dropdown, ToastProvider, ConfirmModal } from "../components/ui";
import { callAPI } from "../utils/callserver";
import CategoryMaster from "./CategoryMaster";

export default function ProductMaster({ products, setProducts, categories }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", category: 0, barcode: "", gstPer: 18, sale_rate: 0, purc_rate: 0, o_qty: 0 });
  const [edit, setEdit] = useState(null);
  const [list, setList] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState({ open: false, msg: null, type: null });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg] = useState("Are You Sure You want to Delete this Product?");
  const loadModelref = useRef({});
  const categoryRef = useRef(null); 
  const [focusedData, setfocusedData] = useState({});

    // ✅ Called by category master after any add/edit/delete → re-fetch dropdown
  const handleCategorySaved = async () => {
    const res = await callAPI("categories", "GET");
    if (res.success) setCategoryData(res?.data ?? []);
  };


  const genBarcode = () => "BAR" + String(Date.now()).slice(-6);

  

  const show = (msg, type = "success") => {
    setToasts({ open: true, msg: msg, type: type });
    setTimeout(() => {
      setToasts({ open: false });
    }, 3000);
  };

  // Fetch accounts from API
  const fetchProduct = async (loadModel) => {
     try {
      loadModelref.current = loadModel
      //console.log(loadModel);
      let url = "products";
      url += `?page=${loadModel.page}`;
      url += `&limit=${loadModel.pageSize}`;
      url += loadModel.search ? `&search=${loadModel.search}` : "";
      //console.log(url);
      setLoading(true);
      const res = await callAPI(url, "GET");
      if (res.success) {
        setList(res?.data ?? []);
        setTotal(res?.pagination?.total ?? 0)
      }
    } catch (err) {
      console.error("Error fetching Products:", err);
    } finally {
      setLoading(false);
    }
  };

  const open = async (p) => {
    const res = await callAPI("categories", "GET");
    if (res.success)
      setCategoryData(res?.data ?? []);
    if (p) {
      setForm({ ...p });
      setEdit(p.id);
    } else {
      setForm({ name: "", category: 0, barcode: "", gstPer: 18, sale_rate: 0, purc_rate: 0, o_qty: 0 });
      setEdit(null);
    }
    setModal(true);
  };

  const save = async () => {
    if (!form.name) {
      show("Name is required!", "error");
      return;
    }
    else if (!form.barcode) {
      show("Barcode is required!", "error");
      return;
    }
    const model =
    {
      name: form.name,
      category: form.category,
      purc_rate: form.purc_rate,
      sale_rate: form.sale_rate,
      hsn_code: form.hsn_code,
      barcode: form.barcode,
      o_qty: form.o_qty
    }


    try {
      setLoading(true);

      let res;
      if (edit) {
        // Update existing product
        res = await callAPI(`products/${edit}`, "PUT", model);
      } else {
        // Create new product
        res = await callAPI("products", "POST", model);
      }
      show(res.message, res.success ? "success" : "error" );
      if (res.success) {
        setModal(false);
        await fetchProduct(loadModelref.current); // Refresh the grid
      } 
    } catch (err) {
      show(`Error ${edit ? 'updating' : 'creating'} product`, "error");
    } finally {
      setLoading(false);
    }
  };

   // Delete account
  const deleteProduct = async (confirm, data) => {
    setfocusedData(data);
    console.log(data);
    if (!confirm)
      setConfirmOpen(true)
    else {
      try {
        setLoading(true);
        const res = await callAPI(`products/${focusedData.id}`, "DELETE");
         show(res.message, res.success ? "success" : "error" );
        if (res.success) {
          await fetchProduct(loadModelref.current); // Refresh the grid
        } 
      } catch (err) {
        show("Error deleting Product", "error");
      } finally {
        setLoading(false);
        setConfirmOpen(false);
      }
    }
  };

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
              render: (value, row) => {
                return <span style={{ fontWeight: 600, color: C.text }}>{value}</span>;
              },
            },
            { key: "category_name", label: "Category" },
            { key: "barcode", label: "Barcode" },
            { key: "gstPer", label: "GST%" , render: (value, row) => {
                return <span>{value + "%" }</span>;
              },},
            { key: "sale_rate", label: "sale Rate" },
            { key: "purc_rate", label: "purc Rate" },
            { key: "o_qty", label: "Opening Qty" },
          ]}
          data={list} // each item must have an `id` field
          pageSize={15}
          lazy={true}
          total={total}
          // selectable={true}
           onFetch={(loadModel) => { fetchProduct(loadModel); }}
          HeaderButtons={[
            {
              key: "Add",
              label: "Add Product",
              icon: "+",
              variant: "primary",
              hotkey: "ctrl+a",
              onClick: (ids, all, focused) => open(null),
            },
          ]}
          footerButtons={[
            {
              key: "edit",
              label: "Edit",
              icon: "⬇",
              hotkey: "ctrl+e",
              onClick: (ids, all, focused) => open(focused),
            },
            {
              key: "del",
              label: "Delete",
              icon: "🗑",
              variant: "danger",
              hotkey: "ctrl+d",
              onClick: (ids, all, focused) => deleteProduct(false, focused),
            },
          ]}
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={edit ? "Edit Product" : "Add Product"} width={600}>
        <div className="form-grid-2">
          <Field label="Product Name" required>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Category">
            <Dropdown
              value={form.category}
              onChange={(v, opt) => { setForm({ ...form, category: v }) }}
              clearable
              options={categoryData}
              footerButtons={[
                {
                  icon: "+", label: "Add", hotkey: "ctrl+a",
                  onClick: () => categoryRef.current?.openAdd()
                },
                {
                  icon: "⬇", label: "Edit", hotkey: "ctrl+e",
                  onClick: (idx, focused) => {
                    if (!focused) return;
                    categoryRef.current?.openEdit(focused);
                  }
                },
                {
                  icon: "🗑", label: "Delete", hotkey: "ctrl+d",
                  onClick: (idx, focused) => {
                    if (!focused) return;
                    categoryRef.current?.openDelete(focused);
                  }
                },
              ]}
            />
          </Field>
        </div>
        <div className="form-grid-21">
          <Field label="Barcode" required>
            <input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </Field>
          <Field label="GST %">

            <Dropdown
              value={form.gstPer}
              onChange={(v, opt) => { setForm({ ...form, gstPer: v }) }}
              clearable
              options={[{ id: 0, name: "Not Applicable(0%)" }, { id: 5, name: "5%" }, { id: 12, name: "12%" }, { id: 18, name: "18%" }, { id: 28, name: "28%" }]}
            />
          </Field>
        </div>
        <div className="form-grid-2">
          <Field label="sale Rate (₹)" required>
            <input type="number" value={form.sale_rate} onChange={(e) => setForm({ ...form, sale_rate: e.target.value })} />
          </Field>
          <Field label="purchase Rate (₹)" required>
            <input type="number" value={form.purc_rate} onChange={(e) => setForm({ ...form, purc_rate: e.target.value })} />
          </Field>

        </div>
        <div className="form-grid-2">
          <Field label="HSN Code">
            <input value={form.hsn_code} onChange={(e) => setForm({ ...form, hsn_code: e.target.value })} />
          </Field>
          <Field label="Opening Qty">
            <input type="number" value={form.o_qty} onChange={(e) => setForm({ ...form, o_qty: e.target.value })} />
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => setModal(false)}>
            Cancel
          </Btn>
          <Btn onClick={save}>Save Product</Btn>
        </div>
      </Modal>

      <CategoryMaster ref={categoryRef} onSaved={handleCategorySaved} /> 


      <ToastProvider open={toasts.open} msg={toasts.msg} type={toasts.type} >
      </ToastProvider>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => { deleteProduct(true) }}
        message={confirmMsg}
      />
    </div>
  );
}
