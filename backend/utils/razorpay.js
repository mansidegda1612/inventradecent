// Thin wrapper over Razorpay's REST API using axios (already a project
// dependency — no need for the official `razorpay` SDK for what we use).
// All calls use HTTP Basic Auth with RAZORPAY_KEY_ID:RAZORPAY_KEY_SECRET,
// exactly as Razorpay's server-side API docs specify.
const axios = require("axios");

const client = axios.create({
  baseURL: "https://api.razorpay.com/v1",
  auth: {
    username: process.env.RAZORPAY_KEY_ID,
    password: process.env.RAZORPAY_KEY_SECRET,
  },
});

async function createPlan({ period, interval, name, amountPaise, description }) {
  const { data } = await client.post("/plans", {
    period,
    interval,
    item: { name, amount: amountPaise, currency: "INR", description },
  });
  return data; // { id: "plan_xxx", ... }
}

async function createSubscription({ planId, totalCount, notes }) {
  const { data } = await client.post("/subscriptions", {
    plan_id: planId,
    customer_notify: 1,
    total_count: totalCount,
    notes,
  });
  return data; // { id: "sub_xxx", short_url, status, ... }
}

module.exports = { client, createPlan, createSubscription };
