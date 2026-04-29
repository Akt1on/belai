/**
 * /api/generate.js — Vercel Serverless Function
 * 
 * Calls HuggingFace Inference API (stabilityai/stable-diffusion-2-inpainting)
 * with proper base64 → blob handling, retries, and detailed error reporting.
 * 
 * ENV:  HF_TOKEN — HuggingFace API token (Settings → Access Tokens)
 * 
 * Request body (JSON):
 *   image  — base64 PNG/JPEG (original photo)
 *   mask   — base64 PNG (white = inpaint zone, black = keep)
 *   prompt — text description of desired surface
 * 
 * Response: image/png binary
 */

export const config = { maxDuration: 60 };   // allow up to 60s (Vercel Pro) / 10s (Hobby)

const MODEL_URL =
  "https://api-inference.huggingface.co/models/sd2-community/stable-diffusion-2-inpainting";

const NEGATIVE_PROMPT =
  "blurry, low quality, unrealistic, cartoon, painting, artifacts, deformed, watermark, text";

// HuggingFace inference API accepts multipart form-data for inpainting
async function callHF(imageBlob, maskBlob, prompt, token) {
  const form = new FormData();
  form.append("inputs", prompt);
  form.append("parameters[negative_prompt]", NEGATIVE_PROMPT);
  form.append("parameters[num_inference_steps]", "30");
  form.append("parameters[guidance_scale]", "7.5");
  form.append("parameters[strength]", "0.9");
  form.append("image", imageBlob, "image.png");
  form.append("mask_image", maskBlob, "mask.png");

  const response = await fetch(MODEL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  return response;
}

// Convert base64 string to Blob
function b64toBlob(b64, mimeType = "image/png") {
  const binary = Buffer.from(b64, "base64");
  return new Blob([binary], { type: mimeType });
}

export default async function handler(req, res) {
  // CORS headers for local testing
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.HF_TOKEN;
  if (!token) return res.status(500).json({ error: "HF_TOKEN env variable not set" });

  let body = req.body;
  // Handle raw JSON body if not auto-parsed
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }

  const { image, mask, prompt } = body || {};
  if (!image || !mask || !prompt) {
    return res.status(400).json({ error: "Missing fields: image, mask, prompt required" });
  }

  // Trim data URL prefix if present
  const imgB64  = image.includes(",") ? image.split(",")[1] : image;
  const maskB64 = mask.includes(",")  ? mask.split(",")[1]  : mask;

  const imageBlob = b64toBlob(imgB64, "image/png");
  const maskBlob  = b64toBlob(maskB64, "image/png");

  // Retry logic — model may be loading (503)
  const MAX_RETRIES = 3;
  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const hfRes = await callHF(imageBlob, maskBlob, prompt, token);

      if (hfRes.ok) {
        const buffer = await hfRes.arrayBuffer();
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store");
        return res.send(Buffer.from(buffer));
      }

      // Model loading — wait and retry
      if (hfRes.status === 503) {
        const errBody = await hfRes.json().catch(() => ({}));
        const waitSec = errBody.estimated_time ?? 20;
        console.log(`[HF] Model loading, waiting ${waitSec}s (attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, Math.min(waitSec * 1000, 25000)));
        continue;
      }

      // Other HF error
      const errText = await hfRes.text().catch(() => hfRes.status.toString());
      lastError = `HuggingFace error ${hfRes.status}: ${errText.slice(0, 300)}`;
      break;

    } catch (err) {
      lastError = err.message;
      console.error(`[generate] attempt ${attempt} error:`, err.message);
      if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.error("[generate] all attempts failed:", lastError);
  return res.status(500).json({ error: lastError || "Generation failed after retries" });
}
