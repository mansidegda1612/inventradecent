import { useState } from "react";
import { C } from "../utils/theme";
import { Btn, Field } from "../components/ui";
import { callAPI } from "../utils/callserver";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const handle = async () => {
    let res = await callAPI("auth/login", "POST", {
      "user_id": email,
      "password": password
    });
    if (res.success && res.data) {
      sessionStorage.setItem("token", res.data.accessToken);
      sessionStorage.setItem("userRole", res.data.user.userrole);

      onLogin(res.data.user.userrole);
    }
    else
      setErr(res.message);
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
              type="text"
              autoFocus
            />
          </Field>
          <Field label="Password" required>
            <input
              value={password}

              onChange={e => setPassword(e.target.value)}
              type="password"
              onKeyDown={e => e.key === "Enter" && handle()}
            />
          </Field>

          {err && <p style={{ color: C.red, fontSize: 12, marginBottom: 14 }}>{err}</p>}

          <Btn onClick={handle} style={{ width: "100%", justifyContent: "center" }}>
            Sign In →
          </Btn>
        </div>
      </div>
    </div>
  );
}
