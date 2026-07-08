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
      localStorage.setItem("token", res.data.accessToken);
      localStorage.setItem("userRole", res.data.user.userrole);

      onLogin(res.data.user.userrole);
    }
    else
      setErr(res.message);
  };

  return (
    <div className="login-page">
      <div className="login-box">
        {/* Brand */}
        <div className="login-brand-wrap">
          <div className="login-brand">
            <span className="login-brand-highlight">Inventra</span>Decent
          </div>
          <p className="login-subtitle">
            Accounting & Inventory Management
          </p>
        </div>

        {/* Form card */}
        <div className="login-card">
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

          {err && <p className="login-error">{err}</p>}

          <Btn onClick={handle} className="login-submit-btn">
            Sign In →
          </Btn>
        </div>
      </div>
    </div>
  );
}