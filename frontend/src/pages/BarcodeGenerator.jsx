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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: 20,
          alignItems: "start",
        }}
      >
        {/* ── LEFT: Product Selection ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Select Product"style={{ overflow: "visible" }}>
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
              <div style={{ marginTop: 4 }}>
                {details.map(({ label, value, mono }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 12.5,
                      padding: "7px 0",
                      borderBottom: `1px solid ${C.borderLight}`,
                    }}
                  >
                    <span style={{ color: C.hint, fontWeight: 500 }}>{label}</span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: C.text,
                        fontFamily: mono
                          ? "'JetBrains Mono', 'Courier New', monospace"
                          : "inherit",
                        fontSize: mono ? 12 : 12.5,
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  marginTop: 12,
                  padding: "20px 0",
                  textAlign: "center",
                  color: C.hint,
                  fontSize: 12,
                }}
              >
                No product selected
              </div>
            )}
          </Card>

          {/* ── Print Count Card ── */}
          <Card title="Print Options">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <label
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.sub,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    minWidth: 110,
                  }}
                >
                  Number of Copies
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <button
                    onClick={() => setPrintCount((c) => Math.max(1, c - 1))}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: `1.5px solid ${C.border}`,
                      background: C.card,
                      color: C.sub,
                      fontSize: 18,
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontFamily: "inherit",
                    }}
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
                    style={{
                      width: "100%",
                      height: 32,
                      padding: "0 10px",
                      textAlign: "center",
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                      borderRadius: 8,
                      border: `1.5px solid ${C.border}`,
                    }}
                  />
                  <button
                    onClick={() => setPrintCount((c) => Math.min(500, c + 1))}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      border: `1.5px solid ${C.border}`,
                      background: C.card,
                      color: C.sub,
                      fontSize: 18,
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontFamily: "inherit",
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Quick-select count chips */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[1, 5, 10, 20, 50, 100].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPrintCount(n)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 20,
                      border: `1.5px solid ${printCount === n ? C.accent : C.border}`,
                      background: printCount === n ? C.accent + "14" : "transparent",
                      color: printCount === n ? C.accent : C.muted,
                      fontSize: 11.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all .12s",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <p style={{ fontSize: 11, color: C.hint, marginTop: -4 }}>
                Prints <strong style={{ color: C.sub }}>{printCount}</strong>{" "}
                {printCount === 1 ? "label" : "labels"} of the selected product.
              </p>
            </div>
          </Card>
        </div>

        {/* ── RIGHT: Preview + Actions ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Barcode Preview">
            {/* Canvas area */}
            <div
              style={{
                background: product ? "#ffffff" : C.bg,
                borderRadius: 12,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: `1.5px solid ${C.border}`,
                minHeight: 200,
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Subtle grid background */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `radial-gradient(${C.border} 1px, transparent 1px)`,
                  backgroundSize: "20px 20px",
                  opacity: product ? 0.3 : 0.6,
                  pointerEvents: "none",
                }}
              />
              <canvas
                ref={canvasRef}
                width={400}
                height={140}
                style={{
                  width: "100%",
                  maxWidth: 400,
                  borderRadius: 8,
                  background: "#fff",
                  position: "relative",
                  zIndex: 1,
                  boxShadow: product
                    ? "0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)"
                    : "none",
                  border: product ? `1px solid ${C.borderLight}` : "none",
                }}
              />

              {product && (
                <div
                  style={{
                    position: "relative",
                    zIndex: 1,
                    marginTop: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 14px",
                    background: C.accentBg ?? C.accent + "14",
                    borderRadius: 20,
                    border: `1px solid ${C.accent}22`,
                  }}
                >
                  <span style={{ fontSize: 11.5, color: C.accent, fontWeight: 700 }}>
                    🏷 {product.barcode}
                  </span>
                  <span
                    style={{
                      width: 4,
                      height: 4,
                      borderRadius: "50%",
                      background: C.accent + "60",
                    }}
                  />
                  <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 500 }}>
                    {product.name}
                  </span>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 16,
                alignItems: "center",
              }}
            >
              <button
                onClick={handlePrint}
                disabled={!product}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 9,
                  border: "none",
                  background: product ? C.accent : C.border,
                  color: product ? "#fff" : C.hint,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: product ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  transition: "all .15s",
                  boxShadow: product ? `0 2px 8px ${C.accent}33` : "none",
                }}
              >
                🖨 Print{" "}
                {product ? (
                  <span
                    style={{
                      background: "rgba(255,255,255,0.25)",
                      borderRadius: 6,
                      padding: "1px 7px",
                      fontSize: 11.5,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    ×{printCount}
                  </span>
                ) : null}
              </button>

              <Btn
                variant="ghost"
                onClick={handleDownload}
                disabled={!product}
                style={{ height: 40, paddingLeft: 16, paddingRight: 16 }}
              >
                ⬇ Download PNG
              </Btn>
            </div>
          </Card>

          {/* ── Print Summary Card (shows what will print) ── */}
          {product && (
            <Card
              style={{
                background: `linear-gradient(135deg, ${C.accent}08 0%, ${C.accent}04 100%)`,
                border: `1.5px solid ${C.accent}20`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: ".08em",
                      color: C.muted,
                      marginBottom: 4,
                    }}
                  >
                    Print Summary
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.sub,
                      fontWeight: 500,
                    }}
                  >
                    {product.name}{" "}
                    <span style={{ color: C.hint }}>·</span>{" "}
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 12,
                        color: C.muted,
                      }}
                    >
                      {product.barcode}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: C.accent + "14",
                    border: `1px solid ${C.accent}30`,
                    borderRadius: 10,
                    padding: "8px 16px",
                  }}
                >
                  <span style={{ fontSize: 20 }}>🏷</span>
                  <div>
                    <div
                      style={{
                        fontSize: 22,
                        fontWeight: 800,
                        color: C.accent,
                        fontFamily: "'JetBrains Mono', monospace",
                        lineHeight: 1.1,
                      }}
                    >
                      {printCount}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: C.accent + "99",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: ".06em",
                      }}
                    >
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