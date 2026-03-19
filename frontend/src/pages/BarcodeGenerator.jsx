import { useState, useEffect, useRef } from "react";
import { C } from "../utils/theme";
import { fmt, fmtNum } from "../utils/format";
import { Btn, Card, Field, PageHeader } from "../components/ui";

export default function BarcodeGenerator({ products }) {
  const [selected, setSelected] = useState(products[0]?.id || null);
  const canvasRef = useRef(null);
  const product   = products.find(p => p.id === Number(selected));

  useEffect(() => {
    if (!product || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    const barcode = product.barcode;
    ctx.fillStyle = "#1E1B4B";
    let x = 30;
    for (let i = 0; i < barcode.length * 6; i++) {
      const charCode = barcode.charCodeAt(i % barcode.length);
      const draw = (charCode + i) % 3 !== 0;
      const bw   = draw ? 3 : 2;
      if (draw) ctx.fillRect(x, 20, bw, h - 60);
      x += bw + 1;
    }

    ctx.fillStyle = "#111827";
    ctx.font      = "bold 13px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.fillText(product.barcode, w / 2, h - 18);

    ctx.font      = "11px 'Inter', sans-serif";
    ctx.fillStyle = "#6B7280";
    ctx.fillText(product.name, w / 2, h - 5);
  }, [product]);

  const download = () => {
    if (!canvasRef.current) return;
    const a   = document.createElement("a");
    a.href    = canvasRef.current.toDataURL("image/png");
    a.download = `barcode-${product?.barcode}.png`;
    a.click();
  };

  return (
    <div>
      <PageHeader title="Barcode Generator" sub="Generate and download product barcodes." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Left: select */}
        <Card title="Select Product">
          <Field label="Product">
            <select value={selected || ""} onChange={e => setSelected(e.target.value)}>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.barcode}</option>
              ))}
            </select>
          </Field>
          {product && (
            <div style={{ marginTop: 16 }}>
              {[
                ["Barcode", product.barcode],
                ["Rate",    fmt(product.rate)],
                ["GST",     product.gst + "%"],
                ["Qty",     fmtNum(product.qty)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                  <span style={{ color: C.hint }}>{k}</span>
                  <span className="mono" style={{ fontWeight: 600, color: C.text }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Right: preview */}
        <Card title="Barcode Preview">
          <div style={{ background: C.bg, borderRadius: 10, padding: 20, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}` }}>
            <canvas ref={canvasRef} width={300} height={120} style={{ width: "100%", borderRadius: 6, background: "#fff" }} />
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <Btn onClick={download} style={{ flex: 1, justifyContent: "center" }}>⬇ Download PNG</Btn>
            <Btn variant="ghost" onClick={() => window.print()}>🖨 Print</Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
