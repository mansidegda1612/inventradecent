import { useState } from "react";
import { Btn, Field } from "../components/ui";
import { callAPI } from "../utils/callserver";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await callAPI("auth/login", "POST", { user_id: email, password });
      if (res.success && res.data) {
        login(res.data);
      } else {
        setErr(res.message || "Login failed");
      }
    } catch {
      setErr("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-brand-wrap">
          <div className="login-brand">
            <span className="login-brand-highlight">Inventra</span>Decent
          </div>
          <p className="login-subtitle">
            Accounting & Inventory Management
          </p>
        </div>

        <div className="login-card">
          <Field label="Login ID" required>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="text"
              autoFocus
              onKeyDown={e => e.key === "Enter" && handle()}
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

          {err && <p className="login-error">{err}</p>}

          <Btn onClick={handle} className="login-submit-btn" disabled={loading}>
            {loading ? "Signing In…" : "Sign In →"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
