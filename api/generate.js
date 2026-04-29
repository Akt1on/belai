export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { image, mask, prompt } = req.body;
  const token = process.env.HF_TOKEN;

  const response = await fetch(
    "https://api-inference.huggingface.co/models/stable-diffusion-v1-5/stable-diffusion-inpainting",
    {
      method: "POST",
      headers: {
        "Authorization": Bearer ${token},
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { image, mask_image: mask }
      })
    }
  );

  if (!response.ok) {
    const text = await response.text();
    return res.status(500).json({ error: text });
  }

  const buffer = await response.arrayBuffer();
  res.setHeader("Content-Type", "image/png");
  res.send(Buffer.from(buffer));
}
