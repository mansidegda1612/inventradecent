import { useState } from "react";
import { C } from "../utils/theme";
import { Btn, Field } from "../components/ui";

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState("admin@inventra.com");
  const [password, setPassword] = useState("admin123");
  const [err, setErr]           = useState("");

  const handle = () => {
    if (email === "admin@inventra.com" && password === "admin123") onLogin("admin");
    else if (email === "sales@inventra.com" && password === "user123") onLogin("user");
    else setErr("Invalid credentials.");
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #EEECFF 0%, #F4F6FA 60%, #EDF2FF 100%)",
    }}>
      <div style={{ width: 420 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 38, fontWeight: 900, color: "#111827", letterSpacing: "-.03em" }}>
            <span style={{ color: C.accent }}>Inventra</span>Decent
          </div>
          <p style={{ color: C.muted, marginTop: 8, fontSize: 14 }}>
            Accounting & Inventory Management
          </p>
        </div>

        {/* Form card */}
        <div style={{
          background: "#fff", borderRadius: 18, border: `1px solid ${C.border}`,
          padding: 28, boxShadow: "0 8px 40px #4F46E514",
        }}>
          <Field label="Email" required>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              placeholder="email@example.com"
            />
          </Field>
          <Field label="Password" required>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password" 
              placeholder="••••••••"
              onKeyDown={e => e.key === "Enter" && handle()}
            />
          </Field>

          {err && <p style={{ color: C.red, fontSize: 12, marginBottom: 14 }}>{err}</p>}

          <Btn onClick={handle} style={{ width: "100%", justifyContent: "center" }}>
            Sign In →
          </Btn>

          <p style={{ fontSize: 11, color: C.hint, marginTop: 16, textAlign: "center", lineHeight: 1.8 }}>
            Admin: admin@inventra.com / admin123<br />
            User: sales@inventra.com / user123
          </p>
        </div>
      </div>
    </div>
  );
}
