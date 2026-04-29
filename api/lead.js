/**
 * /api/lead.js — Vercel Serverless Function
 *
 * Saves lead to:
 *   1. Vercel KV (if KV_REST_API_URL + KV_REST_API_TOKEN env vars set)
 *   2. Telegram bot notification (if TG_BOT_TOKEN + TG_CHAT_ID env vars set)
 *   3. Console log fallback (always)
 *
 * Request body (JSON):
 *   name, phone, area, city, coverage, source
 */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }

  const { name, phone, area, city, coverage, source } = body || {};

  if (!name || !phone) {
    return res.status(400).json({ error: "name and phone are required" });
  }

  const lead = {
    id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
    phone: phone.trim(),
    area: area || null,
    city: city || null,
    coverage: coverage || null,
    source: source || "ai-visualizer",
    createdAt: new Date().toISOString(),
    ip: req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown",
  };

  console.log("[LEAD]", JSON.stringify(lead));

  const results = await Promise.allSettled([
    saveToKV(lead),
    sendTelegram(lead),
  ]);

  const kvOk = results[0].status === "fulfilled";
  const tgOk = results[1].status === "fulfilled";

  if (!kvOk) console.warn("[LEAD] KV save failed:", results[0].reason?.message);
  if (!tgOk) console.warn("[LEAD] TG notify failed:", results[1].reason?.message);

  return res.status(200).json({
    ok: true,
    id: lead.id,
    saved: { kv: kvOk, telegram: tgOk },
  });
}

// ─── VERCEL KV ───────────────────────────────────────────────────────────────
async function saveToKV(lead) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return; // KV not configured — skip silently

  const key = `leads:${lead.id}`;
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(lead),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status);
    throw new Error(`KV error ${res.status}: ${text}`);
  }

  // Also push to a sorted list for dashboard retrieval
  await fetch(`${url}/lpush/leads_list`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(key),
  }).catch(() => {}); // non-critical
}

// ─── TELEGRAM NOTIFICATION ───────────────────────────────────────────────────
const COVERAGE_LABELS = {
  asphalt:  "🚗 Асфальт",
  tiles:    "🧱 Брусчатка",
  concrete: "⬜ Бетон",
  gravel:   "🪨 Щебень",
};

async function sendTelegram(lead) {
  const botToken = process.env.TG_BOT_TOKEN;
  const chatId   = process.env.TG_CHAT_ID;
  if (!botToken || !chatId) return; // TG not configured — skip silently

  const covLabel = COVERAGE_LABELS[lead.coverage] || lead.coverage || "—";
  const areaStr  = lead.area ? `${lead.area} м²` : "не указана";
  const cityStr  = lead.city || "не указан";

  const text = [
    `🔔 *Новая заявка BELDOR AI*`,
    ``,
    `👤 Имя: *${escMd(lead.name)}*`,
    `📞 Телефон: *${escMd(lead.phone)}*`,
    `📍 Город: ${escMd(cityStr)}`,
    `📐 Площадь: ${areaStr}`,
    `🏗 Покрытие: ${covLabel}`,
    ``,
    `🕐 ${new Date(lead.createdAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК`,
    `🆔 ${lead.id}`,
  ].join("\n");

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`TG error ${res.status}: ${err.description || "unknown"}`);
  }
}

// Escape Markdown special chars
function escMd(str) {
  return String(str).replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
