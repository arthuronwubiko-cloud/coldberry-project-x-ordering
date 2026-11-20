// Customer Feedback API for Coldberry Ice Cream Nigeria
// Accepts ratings, reviews, order PIN, and tags, writing concurrently to both
// Neon Postgres and Supabase with local fallback.

const { insertFeedback, getFeedback } = require("./db");
const { getClientIp, checkRateLimit, applyCorsHeaders } = require("./overload-protection");

function parseBody(req) {
  if (typeof req.body === "object" && req.body !== null) return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }
  return {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  applyCorsHeaders(req, res, "GET, POST, OPTIONS", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (req.method === "GET") {
    const limit = Math.min(Number(req.query?.limit) || 20, 100);
    const offset = Math.max(Number(req.query?.offset) || 0, 0);
    const result = await getFeedback({ limit, offset });
    const sanitized = (result.feedback || []).map(({ order_pin, ...rest }) => rest);
    return res.status(200).json({
      feedback: sanitized,
      provider: result.provider,
      count: sanitized.length,
    });
  }

  if (req.method === "POST") {
    const ip = getClientIp(req);
    const rateCheck = checkRateLimit(ip, 30, 60 * 1000); // 30 per min
    if (!rateCheck.allowed) {
      return res.status(429).json({ error: "Too many feedback requests. Please wait a moment." });
    }

    const body = parseBody(req);
    const rating = Number(body.rating);

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be an integer between 1 and 5." });
    }

    const result = await insertFeedback({
      rating,
      customer_name: body.customer_name || body.name || "Customer",
      order_pin: body.order_pin || body.pin || null,
      tags: body.tags || [],
      comments: body.comments || body.comment || body.message || "",
      source: body.source || "web_bubble",
      feedback_type: body.feedback_type || body.feedbackType || body.type || "feedback",
    });

    return res.status(200).json({
      success: true,
      message: "Thank you for your feedback! We appreciate you helping us improve Coldberry Ice Cream.",
      record: result.record,
      neon: result.neon,
      supabase: result.supabase,
    });
  }

  res.setHeader("Allow", "GET, POST, OPTIONS");
  return res.status(405).json({ error: "Method not allowed." });
};
