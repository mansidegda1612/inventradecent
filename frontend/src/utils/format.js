export function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString("en-IN");
}

export function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  // Output: 30 Apr 2025
}

export function fmtDateShort(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  // Output: 30/04/2025
}

export function fmtDateTime(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  // Output: 30 Apr 2025, 02:30 pm
}

export function fmtDateISO(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toISOString().slice(0, 10);
  // Output: 2025-04-30  (useful for <input type="date" value={...} />)
}