import fs from "node:fs";
import path from "node:path";
const PUBLIC_URL = (
    process.env.PUBLIC_URL ||
    "https://fireworkproductcatalogs.vercel.app"
).replace(/\/+$/, "");
const MEDIA_PATH = "2026/media/";
// ==========================================
// CSV PARSER
// ==========================================
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
            if (row.some(v => v !== "")) {
                rows.push(row);
            }
            row = [];
            field = "";
        } else if (char !== "\r") {
            field += char;
        }
    }
    row.push(field.trim());
    if (row.some(v => v !== "")) {
        rows.push(row);
    }
    if (!rows.length) return [];
    const headers = rows.shift().map(h => h.trim());
    return rows.map(values =>
        Object.fromEntries(
            headers.map((header, i) => [
                header,
                values[i] || ""
            ])
        )
    );
}
// ==========================================
// SAFE HTML
// ==========================================
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}
// ==========================================
// PRODUCT MEDIA PATH
// EXACTLY SAME AS MAIN CATALOGUE SCRIPT
// ==========================================
function getProductFolder(product) {
    const paddedID = String(product.id).padStart(3, "0");
    return (
        MEDIA_PATH +
        paddedID +
        "_" +
        encodeURIComponent(product.code) +
        "/"
    );
}
function getProductImage(product) {
    return (
        getProductFolder(product) +
        encodeURIComponent(product.name) +
        ".jpg"
    );
}
// ==========================================
// SHARE API
// ==========================================
export default function handler(req, res) {
    try {
        const csvPath = path.join(
            process.cwd(),
            "public",
            "2026",
            "data",
            "products.csv"
        );
        if (!fs.existsSync(csvPath)) {
            return res.status(500).send("Products CSV not found.");
        }
        const products = parseCSV(
            fs.readFileSync(csvPath, "utf8")
        );
        const id = String(req.query.code || "").trim();
        // Direct CSV field lookup.
        // No getField().
        const product = products.find(p =>
            String(p.id).trim() === id
        );
        if (!product) {
            return res.status(404).send("Product not found.");
        }
        const productId = String(product.id).trim();
        const productCode = String(product.code || "").trim();
        const productName = String(product.name || "").trim();
        if (!productCode || !productName) {
            return res.status(500).send(
                "Product code or product name is missing."
            );
        }
        const title = productName;
        const description =
            String(product.desc || "").trim() || title;
        // EXACT SAME IMAGE PATH AS CATALOGUE
        const image =
            `${PUBLIC_URL}/${getProductImage(product)}`;
        const shareURL =
            `${PUBLIC_URL}/share/${encodeURIComponent(productId)}`;
        const target =
            `${PUBLIC_URL}/#product-${encodeURIComponent(productId)}`;
        // ==========================================
        // RESPONSE HEADERS
        // ==========================================
        res.setHeader(
            "Cache-Control",
            "public, max-age=0, s-maxage=300"
        );
        res.setHeader(
            "Content-Type",
            "text/html; charset=utf-8"
        );
        res.setHeader(
            "X-Robots-Tag",
            "index, follow"
        );
        // ==========================================
        // HTML SOCIAL PREVIEW
        // ==========================================
        return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport"
content="width=device-width, initial-scale=1">
<title>${escapeHTML(title)}</title>
<meta name="description"
content="${escapeHTML(description)}">
<link rel="canonical"
href="${escapeHTML(shareURL)}">
<!-- OPEN GRAPH -->
<meta property="og:type" content="website">
<meta property="og:site_name"
content="Firework Product Catalogue">
<meta property="og:title"
content="${escapeHTML(title)}">
<meta property="og:description"
content="${escapeHTML(description)}">
<meta property="og:url"
content="${escapeHTML(shareURL)}">
<meta property="og:image"
content="${escapeHTML(image)}">
<meta property="og:image:secure_url"
content="${escapeHTML(image)}">
<meta property="og:image:type"
content="image/jpeg">
<meta property="og:image:alt"
content="${escapeHTML(title)}">
<meta property="og:image:width"
content="1200">
<meta property="og:image:height"
content="630">
<!-- TWITTER / X -->
<meta name="twitter:card"
content="summary_large_image">
<meta name="twitter:title"
content="${escapeHTML(title)}">
<meta name="twitter:description"
content="${escapeHTML(description)}">
<meta name="twitter:image"
content="${escapeHTML(image)}">
<!-- REDIRECT AFTER PREVIEW METADATA IS AVAILABLE -->
<meta http-equiv="refresh"
content="3;url=${escapeHTML(target)}">
</head>
<body>
<p>
<a href="${escapeHTML(target)}">
View ${escapeHTML(title)}
</a>
</p>
</body>
</html>`);
    } catch (error) {
        console.error("Share route error:", error);
        return res.status(500).send(
            "Unable to load product."
        );
    }
}