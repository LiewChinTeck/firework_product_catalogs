
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/+$/, "");

app.use(express.json());
app.use(express.static(__dirname));

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
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(value => value !== "")) rows.push(row);

  const headers = (rows.shift() || []).map(h => h.trim());

  return rows.map(values =>
    Object.fromEntries(headers.map((header, i) => [header, values[i] || ""]))
  );
}

function mediaURL(value, folder = "") {
  if (!value) return "";

  const cleaned = String(value)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");

  if (/^(https?:|data:|blob:)/i.test(cleaned)) return cleaned;

  const combined = folder && !cleaned.includes("/")
    ? `${folder}/${cleaned}`
    : cleaned;

  return `${PUBLIC_URL}/2026/${combined.replace(/^2026\/+/, "")}`;
}

app.get("/share/:code", (req, res) => {
  const csvPath = path.join(__dirname, "2026", "products.csv");

  if (!fs.existsSync(csvPath)) {
    return res.status(500).send("Products CSV not found.");
  }

  const products = parseCSV(fs.readFileSync(csvPath, "utf8"));
  const code = decodeURIComponent(req.params.code).trim();

  const product = products.find(p =>
    String(p.code || "").trim().toLowerCase() === code.toLowerCase()
  );

  if (!product) {
    return res.status(404).send("Product not found.");
  }

  const title = product.name || product.code || "Product";
  const description = product.description || title;
  const image = mediaURL(product.image, product.folder);
  const target = `${PUBLIC_URL}/#product-${encodeURIComponent(product.code)}`;

  const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description" content="${escapeHTML(description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHTML(title)}">
<meta property="og:description" content="${escapeHTML(description)}">
<meta property="og:url" content="${escapeHTML(`${PUBLIC_URL}/share/${encodeURIComponent(product.code)}`)}">
${image ? `<meta property="og:image" content="${escapeHTML(image)}">
<meta property="og:image:secure_url" content="${escapeHTML(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHTML(image)}">` : ""}
<meta http-equiv="refresh" content="0;url=${escapeHTML(target)}">
</head>
<body>
<p>Opening ${escapeHTML(title)}…</p>
<p><a href="${escapeHTML(target)}">View product</a></p>
</body>
</html>`);
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
  console.log("Public URL:", PUBLIC_URL);
});
