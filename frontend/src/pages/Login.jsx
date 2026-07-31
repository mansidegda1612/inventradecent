import { useState } from "react";
import { Btn, Field, PasswordInput } from "../components/ui";
import { callAPI, takeAuthNotice } from "../utils/callserver";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Why the last session ended, if it ended for a reason worth explaining
  // (today: the company's subscription lapsed mid-session). Read once on the
  // initial render so the message survives this component re-rendering, and
  // cleared as soon as the user tries to sign in again.
  const [notice, setNotice] = useState(() => takeAuthNotice());
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suBusinessName, setSuBusinessName] = useState("");
  const [suErr, setSuErr] = useState("");
  const [suLoading, setSuLoading] = useState(false);

  const handle = async () => {
    setErr("");
    setNotice("");
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

  const handleSignup = async () => {
    setSuErr("");
    setSuLoading(true);
    try {
      const res = await callAPI("auth/signup", "POST", {
        name: suName, email: suEmail, phone: suPhone, password: suPassword, business_name: suBusinessName,
      });
      if (res.success && res.data) {
        login(res.data);
      } else {
        setSuErr(res.message || "Sign up failed");
      }
    } catch {
      setSuErr("Unable to reach the server. Please try again.");
    } finally {
      setSuLoading(false);
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

        {mode === "login" ? (
          <div className="login-card">
            {notice && <p className="login-notice">{notice}</p>}

            <Field label="Email or Phone" required>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="text"
                autoFocus
                onKeyDown={e => e.key === "Enter" && handle()}
              />
            </Field>
            <Field label="Password" required>
              <PasswordInput
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handle()}
              />
            </Field>

            {err && <p className="login-error">{err}</p>}

            <Btn onClick={handle} className="login-submit-btn" disabled={loading}>
              {loading ? "Signing In…" : "Sign In →"}
            </Btn>

            <p className="login-switch-mode">
              New here?{" "}
              <button type="button" className="login-switch-link" onClick={() => setMode("signup")}>
                Create an account
              </button>
            </p>
          </div>
        ) : (
          <div className="login-card">
            <Field label="Your Name" required>
              <input
                value={suName}
                onChange={e => setSuName(e.target.value)}
                type="text"
                autoFocus
              />
            </Field>
            <Field label="Business Name" required>
              <input
                value={suBusinessName}
                onChange={e => setSuBusinessName(e.target.value)}
                type="text"
              />
            </Field>
            <Field label="Email" required>
              <input
                value={suEmail}
                onChange={e => setSuEmail(e.target.value)}
                type="email"
              />
            </Field>
            <Field label="Phone Number" required>
              <input
                value={suPhone}
                onChange={e => setSuPhone(e.target.value)}
                type="tel"
              />
            </Field>
            <Field label="Password" required>
              <PasswordInput
                value={suPassword}
                onChange={e => setSuPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSignup()}
              />
            </Field>

            {suErr && <p className="login-error">{suErr}</p>}

            <Btn onClick={handleSignup} className="login-submit-btn" disabled={suLoading}>
              {suLoading ? "Creating Account…" : "Create Account →"}
            </Btn>

            <p className="login-switch-mode">
              Already have an account?{" "}
              <button type="button" className="login-switch-link" onClick={() => setMode("login")}>
                Sign in
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
