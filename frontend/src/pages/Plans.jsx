import { useEffect, useState } from "react";
import { Btn, PageHeader } from "../components/ui";
import { callAPI } from "../utils/callserver";
import { useAuth } from "../context/AuthContext";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

const TIERS = ["starter", "growth", "business"];

export default function Plans() {
  const { user, refreshMe } = useAuth();
  const [plans, setPlans] = useState([]);
  const [billingInterval, setBillingInterval] = useState("yearly");
  const [busyPlanId, setBusyPlanId] = useState(null);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    callAPI("billing/plans", "GET").then(res => {
      if (res.success) setPlans(res.data || []);
    });
  }, []);

  const planFor = (tier) => plans.find(p => p.code === `${tier}_${billingInterval === "yearly" ? "y" : "m"}`);

  const handleSubscribe = async (plan) => {
    setErr(""); setNotice("");
    setBusyPlanId(plan.id);
    try {
      const scriptOk = await loadRazorpayScript();
      if (!scriptOk) { setErr("Could not load the payment gateway. Check your connection and try again."); return; }

      const res = await callAPI("billing/subscribe", "POST", { plan_id: plan.id });
      if (!res.success || !res.data) { setErr(res.message || "Could not start checkout"); return; }

      const rz = new window.Razorpay({
        key: res.data.razorpayKeyId,
        subscription_id: res.data.subscriptionId,
        name: "InventraDecent",
        description: `${res.data.planName} plan`,
        prefill: { name: user?.name || "" },
        theme: { color: "#4F46E5" },
        handler: async (response) => {
          const verifyRes = await callAPI("billing/verify", "POST", {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_subscription_id: response.razorpay_subscription_id,
            razorpay_signature: response.razorpay_signature,
          });
          if (verifyRes.success) {
            setNotice("Payment received — your plan is being activated. This can take a few seconds.");
            await refreshMe();
          } else {
            setErr(verifyRes.message || "Payment verification failed. Contact support if you were charged.");
          }
        },
      });
      rz.on("payment.failed", () => setErr("Payment failed. You have not been charged for a successful subscription."));
      rz.open();
    } catch {
      setErr("Unable to start checkout. Please try again.");
    } finally {
      setBusyPlanId(null);
    }
  };

  return (
    <div>
      <PageHeader title="Plans" sub="Pick the plan that fits your business" />

      <div className="plans-toggle">
        <button
          className={`plans-toggle-btn ${billingInterval === "monthly" ? "plans-toggle-btn-active" : ""}`}
          onClick={() => setBillingInterval("monthly")}
        >
          Monthly
        </button>
        <button
          className={`plans-toggle-btn ${billingInterval === "yearly" ? "plans-toggle-btn-active" : ""}`}
          onClick={() => setBillingInterval("yearly")}
        >
          Yearly
        </button>
      </div>

      {err && <p className="login-error">{err}</p>}
      {notice && <p className="plans-notice">{notice}</p>}

      <div className="plans-grid">
        {TIERS.map(tier => {
          const plan = planFor(tier);
          if (!plan) return null;
          return (
            <div key={plan.code} className="plan-card">
              <h3 className="plan-card-title">{plan.name.replace(" (Monthly)", "")}</h3>
              <div className="plan-card-price">
                ₹{plan.price_inr}
                <span className="plan-card-price-period">/{billingInterval === "yearly" ? "yr" : "mo"}</span>
              </div>
              <ul className="plan-card-features">
                <li>{plan.max_orgs} organization{plan.max_orgs > 1 ? "s" : ""}</li>
                <li>{plan.max_users} user{plan.max_users > 1 ? "s" : ""}</li>
                <li>{plan.features?.whatsapp ? "✓ WhatsApp billing" : "No WhatsApp billing"}</li>
              </ul>
              <Btn onClick={() => handleSubscribe(plan)} disabled={busyPlanId === plan.id} className="plan-card-btn">
                {busyPlanId === plan.id ? "Starting checkout…" : "Subscribe"}
              </Btn>
            </div>
          );
        })}
      </div>

      <p className="plans-gst-note">Prices shown are exclusive of GST.</p>
    </div>
  );
}
