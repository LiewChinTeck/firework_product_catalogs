import fs from "node:fs";
import path from "node:path";

const PUBLIC_URL = (
  process.env.PUBLIC_URL || "https://fireworkproductcatalogs.vercel.app"
).replace(/\/+$/, "");

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  text = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      if (row.some(v => v !== "")) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(v => v !== "")) rows.push(row);

  const headers = (rows.shift() || []).map(h => h.trim());

  return rows.map(values =>
    Object.fromEntries(
      headers.map((header, i) => [header, values[i] || ""])
    )
  );
}

function getField(product, names) {
  const normalized = Object.fromEntries(
    Object.entries(product).map(([key, value]) => [
      key.trim().toLowerCase(),
      value
    ])
  );

  for (const name of names) {
    const value = normalized[name.toLowerCase()];
    if (value && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function mediaURL(value, folder = "") {
  if (!value) return "";

  const cleaned = String(value)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");

  if (/^https?:\/\//i.test(cleaned)) return cleaned;

  const filename = cleaned.replace(/^\/+/, "");
  const combined =
    folder && !filename.includes("/")
      ? `${folder}/${filename}`
      : filename;

  return `${PUBLIC_URL}/2026/${combined.replace(/^2026\/+/, "")}`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

export default function handler(req, res) {
  try {
    const csvPath = path.join(process.cwd(), "public", "2026", "products.csv");

    if (!fs.existsSync(csvPath)) {
      return res.status(500).send("Products CSV not found.");
    }

    const products = parseCSV(fs.readFileSync(csvPath, "utf8"));
    const id = String(req.query.code || "").trim();

    const product = products.find(p =>
      getField(p, ["id", "product_id", "product id"]).trim() === id
    );

    if (!product) {
      return res.status(404).send("Product not found.");
    }

    const productCode = getField(product, [
      "code", "product_code", "product code"
    ]);

    const productId = getField(product, [
      "id", "product_id", "product id"
    ]);

    const title =
      getField(product, ["name", "product_name", "product name"]) ||
      productCode ||
      "Product";

    const description =
      getField(product, ["description", "product_description"]) || title;

    const folder = getField(product, [
      "folder", "image_folder", "folder_name"
    ]);

    const imagePath = getField(product, [
      "image", "image_path", "image_url", "image_file",
      "photo_path", "photo", "thumbnail", "thumbnail_path",
      "image_filename"
    ]);

    const image = mediaURL(imagePath, folder);

    const shareURL =
      `${PUBLIC_URL}/share/${encodeURIComponent(productId)}`;

    const target =
      `${PUBLIC_URL}/#product-${encodeURIComponent(productId)}`;

    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300");
    res.setHeader("Content-Type", "text/html; charset=utf-8");

    return res.status(200).send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(description)}">
<meta property="og:url" content="${escapeHTML(shareURL)}">
${image ? `
<meta property="og:image" content="${escapeHTML(image)}">
<meta property="og:image:secure_url" content="${escapeHTML(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHTML(title)}">
<meta name="twitter:description" content="${escapeHTML(description)}">
<meta name="twitter:image" content="${escapeHTML(image)}">` : ""}
<meta http-equiv="refresh" content="0;url=${escapeHTML(target)}">
</head>
<body>
<p><a href="${escapeHTML(target)}">View ${escapeHTML(title)}</a></p>
</body>
</html>`);
  } catch (error) {
    console.error("Share route error:", error);
    return res.status(500).send("Unable to load product.");
  }
}
