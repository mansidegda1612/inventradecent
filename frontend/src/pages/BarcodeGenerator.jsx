import { useState, useEffect, useRef, forwardRef } from "react";
import { C } from "../utils/theme";
import { fmt, fmtNum } from "../utils/format";
import { callAPI } from "../utils/callserver";
import { Btn, Card, Field, PageHeader } from "../components/ui";
import { Dropdown } from "../components/ui";
import JsBarcode from "jsbarcode";

// ─────────────────────────────────────────────────────────────────────────────
// BARCODE CANVAS RENDERER
// Draws a Code-128-style barcode for a given string value
// ─────────────────────────────────────────────────────────────────────────────

function drawBarcode(canvas, value, productName) {
  if (!canvas || !value) return;

  JsBarcode(canvas, value, {
    format: "CODE128",       // scannable by all standard scanners
    width: 2,
    height: 80,
    displayValue: true,
    text: `${value} | ${productName?.slice(0, 20) ?? ""}`,
    fontOptions: "bold",
    fontSize: 12,
    margin: 14,
    background: "#ffffff",
    lineColor: "#1E1B4B",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRINT HELPER — opens a print window with exactly N copies of the barcode
// ─────────────────────────────────────────────────────────────────────────────

function printBarcodes(canvas, count, productName, barcode) {
  if (!canvas) return;
  const dataUrl = canvas.toDataURL("image/png");

  const copies = Array.from({ length: count }, (_, i) => i);

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Barcode — ${barcode}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #fff; font-family: sans-serif; }
        .page { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; }
        .label {
          display: flex; flex-direction: column; align-items: center;
          border: 1px solid #e5e7eb; border-radius: 6px;
          padding: 6px 8px; width: 220px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .label img { width: 200px; height: 80px; object-fit: contain; }
        .label .name { font-size: 10px; color: #374151; margin-top: 3px; text-align: center; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        ${copies
      .map(
        () => `
          <div class="label">
            <img src="${dataUrl}" alt="${barcode}" />
            <div class="name">${productName || barcode}</div>
          </div>
        `
      )
      .join("")}
      </div>
      <script>
        window.onload = function() {
          window.print();
          setTimeout(() => window.close(), 800);
        };
      <\/script>
    </body>
    </html>
  `;

  const win = window.open("", "_blank", "width=900,height=600");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// Props:
//   products        — array of product objects from parent
//   productMasterRef — ref to ProductMaster component (exposes open())
//   onProductSaved  — callback to refresh product list after save/delete
// ─────────────────────────────────────────────────────────────────────────────

export default function BarcodeGenerator({ productMasterRef, onProductSaved }) {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [printCount, setPrintCount] = useState(1);
  const canvasRef = useRef(null);

  // Keep a local refreshed copy so parent can push updates via prop
  const product = products.find((p) => p.id === Number(selectedId)) ?? null;
  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      const res = await callAPI("products", "GET");

      if (res.success) setProducts(res.data ?? []);
    };
    fetchProducts();
  }, []);

  // Auto-select first product once loaded
  useEffect(() => {
    if (!selectedId && products.length > 0) {
      setSelectedId(products[0].id);
    }
  }, [products]);

  // Redraw barcode whenever product changes
  useEffect(() => {
    if (product && canvasRef.current) {
      drawBarcode(canvasRef.current, product.barcode, product.name);
    } else if (canvasRef.current) {
      // Clear canvas
      const ctx = canvasRef.current.getContext("2d");
      ctx.fillStyle = "#F9FAFB";
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.fillStyle = "#D1D5DB";
      ctx.font = "13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Select a product to preview", canvasRef.current.width / 2, 70);
    }
  }, [product]);

  const handleDownload = () => {
    if (!canvasRef.current || !product) return;
    const a = document.createElement("a");
    a.href = canvasRef.current.toDataURL("image/png");
    a.download = `barcode-${product.barcode}.png`;
    a.click();
  };

  const handlePrint = () => {
    if (!product || !canvasRef.current) return;
    const count = Math.max(1, Math.min(500, Number(printCount) || 1));
    printBarcodes(canvasRef.current, count, product.name, product.barcode);
  };

  // ── Dropdown footer buttons — wire to ProductMaster ──────────────────────
  const dropdownFooterButtons = [
    { icon: "+", label: "Add", hotkey: "ctrl+a",
      onClick: () => {
        productMasterRef?.current?.open(null);
      },
    },
    {
       icon: "⬇", label: "Edit", hotkey: "ctrl+e",
      onClick: (idx, focused) => {
        if (!focused) return;
        productMasterRef?.current?.open(focused);
      },
    },
    {
      icon: "🗑", label: "Delete", hotkey: "ctrl+d",
      onClick: (idx, focused) => {
        if (!focused) return;
        productMasterRef?.current?.deleteProduct(false, focused);
      },
    },
  ];

  // ── Product details rows ──────────────────────────────────────────────────
  const details = product
    ? [
      { label: "Barcode", value: product.barcode, mono: true },
      { label: "Sale Rate", value: fmt(product.sale_rate ?? product.rate ?? 0), mono: true },
      { label: "Purchase Rate", value: fmt(product.purc_rate ?? 0), mono: true },
      { label: "GST %", value: (product.gstPer ?? product.gst ?? 0) + "%", mono: false },
      { label: "Category", value: product.category_name ?? "—", mono: false },
      { label: "HSN Code", value: product.hsn_code ?? "—", mono: false },
      { label: "Opening Qty", value: fmtNum(product.o_qty ?? product.qty ?? 0), mono: true },
    ]
    : [];

  return (
    <div>
      <PageHeader
        title="Barcode Generator"
        sub="Generate, preview and print product barcodes."
      />

      <div className="bg-grid">
        {/* ── LEFT: Product Selection ── */}
        <div className="bg-col">
          <Card title="Select Product" className="bg-card-overflow-visible">
            <Field label="Product">
              <Dropdown
                value={selectedId}
                onChange={(v) => setSelectedId(v)}
                options={products}
                placeholder="Search & select product…"
                // footerButtons={dropdownFooterButtons}
              />
            </Field>

            {/* Product Details */}
            {product ? (
              <div className="bg-details-list">
                {details.map(({ label, value, mono }) => (
                  <div key={label} className="bg-detail-row">
                    <span className="bg-detail-label">{label}</span>
                    <span className={`bg-detail-value ${mono ? "bg-detail-value-mono" : ""}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-empty-detail">
                No product selected
              </div>
            )}
          </Card>

          {/* ── Print Count Card ── */}
          <Card title="Print Options">
            <div className="bg-printopts">
              <div className="bg-stepper-row">
                <label className="bg-stepper-label">
                  Number of Copies
                </label>
                <div className="bg-stepper-wrap">
                  <button
                    onClick={() => setPrintCount((c) => Math.max(1, c - 1))}
                    className="bg-stepper-btn"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={printCount}
                    onChange={(e) =>
                      setPrintCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
                    }
                    className="bg-stepper-input"
                  />
                  <button
                    onClick={() => setPrintCount((c) => Math.min(500, c + 1))}
                    className="bg-stepper-btn"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Quick-select count chips */}
              <div className="bg-chip-row">
                {[1, 5, 10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPrintCount(n)}
                    className={`bg-chip ${printCount === n ? "bg-chip-active" : ""}`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <p className="bg-hint-text">
                Prints <strong className="bg-hint-strong">{printCount}</strong>{" "}
                {printCount === 1 ? "label" : "labels"} of the selected product.
              </p>
            </div>
          </Card>
        </div>

        {/* ── RIGHT: Preview + Actions ── */}
        <div className="bg-col">
          <Card title="Barcode Preview">
            {/* Canvas area */}
            <div className={`bg-preview-wrap ${product ? "bg-preview-wrap-active" : ""}`}>
              {/* Subtle grid background */}
              <div className={`bg-preview-grid ${product ? "bg-preview-grid-dim" : ""}`} />
              <canvas
                ref={canvasRef}
                width={400}
                height={140}
                className={`bg-canvas ${product ? "bg-canvas-active" : ""}`}
              />

              {product && (
                <div className="bg-barcode-chip">
                  <span className="bg-barcode-chip-text">
                    🏷 {product.barcode}
                  </span>
                  <span className="bg-barcode-chip-dot" />
                  <span className="bg-barcode-chip-name">
                    {product.name}
                  </span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="bg-actions-row">
              <button
                onClick={handlePrint}
                disabled={!product}
                className="bg-print-btn"
              >
                🖨 Print{" "}
                {product ? (
                  <span className="bg-print-count-badge">
                    ×{printCount}
                  </span>
                ) : null}
              </button>

              <Btn
                variant="ghost"
                onClick={handleDownload}
                disabled={!product}
                className="bg-download-btn"
              >
                ⬇ Download PNG
              </Btn>
            </div>
          </Card>

          {/* ── Print Summary Card (shows what will print) ── */}
          {product && (
            <Card className="bg-summary-card">
              <div className="bg-summary-row">
                <div>
                  <div className="bg-summary-label">
                    Print Summary
                  </div>
                  <div className="bg-summary-title">
                    {product.name}{" "}
                    <span className="u-hint">·</span>{" "}
                    <span className="bg-summary-barcode">
                      {product.barcode}
                    </span>
                  </div>
                </div>

                <div className="bg-summary-count-box">
                  <span className="bg-summary-count-icon">🏷</span>
                  <div>
                    <div className="bg-summary-count-num">
                      {printCount}
                    </div>
                    <div className="bg-summary-count-label">
                      {printCount === 1 ? "label" : "labels"}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}