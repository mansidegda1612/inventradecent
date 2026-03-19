export function fmt(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function fmtNum(n) {
  return Number(n || 0).toLocaleString("en-IN");
}
