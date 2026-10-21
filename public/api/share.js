
const SITE = "https://fireworkproductcatalogs.vercel.app";

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  text = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];

    if (quoted) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && !field) {
      quoted = true;
    } else if (c === ",") {
      row.push(field.trim());
      field = "";
    } else if (c === "\n") {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];

  const headers = rows.shift().map(key =>
    key.trim().toLowerCase().replace(/[\s-]+/g, "_")
  );

  return rows.map(values =>
    Object.fromEntries(headers.map((key, i) => [key, values[i] || ""]))
  );
}

function field(row, names) {
  for (const name of names) {
    if (row?.[name]?.trim()) return row[name].trim();
  }
  return "";
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function asset(path, folder = "") {
  if (!path) return "";
  path = path.trim().replace(/\\/g, "/").replace(/^\.?\//, "");

  if (/^https?:\/\//i.test(path)) return path;
  if (/^(data:|blob:|javascript:)/i.test(path)) return "";

  if (folder && !path.includes("/")) path = `${folder}/${path}`;
  if (!path.startsWith("2026/")) path = `2026/${path}`;

  return `${SITE}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function getCode(row) {
  return field(row, [
    "product_code", "code", "sku", "product_id",
    "id", "item_code", "item_id"
  ]);
}

function getName(row) {
  return field(row, [
    "product_name", "name", "title", "product",
    "item_name", "display_name"
  ]);
}

function getImage(row) {
  return field(row, [
    "image_path", "image", "image_url", "image_file",
    "photo_path", "photo", "thumbnail", "thumbnail_path",
    "image_filename"
  ]);
}

function getVideo(row) {
  return field(row, [
    "video_path", "video", "video_url", "video_file",
    "media_path", "video_filename"
  ]);
}

function getCategory(row) {
  return field(row, [
    "category_name", "category", "category_title",
    "category_id", "type", "product_category"
  ]);
}

function match(rows, value, names) {
  const key = slug(value);
  return rows.find(row =>
    names.some(name => slug(row[name]) === key)
  );
}

export default async function handler(req, res) {
  try {
    const params = new URL(req.url, SITE).searchParams;
    const [htmlResponse, productResponse, categoryResponse, collectionResponse] =
      await Promise.all([
        fetch(`${SITE}/index.html`),
        fetch(`${SITE}/2026/products.csv`).then(r =>
          r.status === 404
            ? fetch(`${SITE}/2026/products-linked.csv`)
            : r
        ),
        fetch(`${SITE}/2026/categories.csv`),
        fetch(`${SITE}/2026/collections.csv`)
      ]);

    if (!htmlResponse.ok || !productResponse.ok ||
        !categoryResponse.ok || !collectionResponse.ok) {
      throw new Error("Could not load catalogue files.");
    }

    let html = await htmlResponse.text();

    const [products, categories, collections] = await Promise.all([
      productResponse.text().then(parseCSV),
      categoryResponse.text().then(parseCSV),
      collectionResponse.text().then(parseCSV)
    ]);

    let title = "Firework Catalogue";
    let description = "Explore our firework products and collections.";
    let image = "";
    let kind = "";
    let id = "";

    const productId = params.get("product");
    const categoryId = params.get("category");
    const collectionId = params.get("collection");

    if (productId) {
      const product = products.find(row =>
        [getCode(row), getName(row)].some(value =>
          value && (
            value === productId ||
            slug(value) === slug(productId)
          )
        )
      );

      if (product) {
        kind = "product";
        id = getCode(product);
        title = getName(product) || id;
        description = `View ${title} in the Firework Catalogue.`;

        const folder = field(product, [
          "folder", "folder_path", "product_folder",
          "directory", "folder_name"
        ]);

        image = asset(
          getImage(product) ||
          getVideo(product).replace(/\.mp4$/i, ".jpg"),
          folder
        );
      }
    } else if (categoryId) {
      const category = categories.find(row =>
        [field(row, ["category_id", "id", "code", "slug"]),
         field(row, ["category_name", "name", "title", "category"])]
          .some(value => value && slug(value) === slug(categoryId))
      );

      if (category) {
        kind = "category";
        id = field(category, ["category_id", "id", "code", "slug"]) ||
          field(category, ["category_name", "name", "title"]);
        title = field(category, [
          "category_name", "name", "title", "category"
        ]) || "Product Category";
        description = `Explore ${title} products.`;
        image = asset(field(category, [
          "image_path", "cover_image", "image", "image_url"
        ]));
      }
    } else if (collectionId) {
      const collection = collections.find(row =>
        [field(row, ["collection_id", "id", "collection_code", "slug"]),
         field(row, ["collection_name", "name", "title", "collection"])]
          .some(value => value && slug(value) === slug(collectionId))
      );

      if (collection) {
        kind = "collection";
        id = field(collection, [
          "collection_id", "id", "collection_code", "slug"
        ]) || field(collection, [
          "collection_name", "name", "title"
        ]);
        title = field(collection, [
          "collection_name", "name", "title", "collection"
        ]) || "Special Collection";
        description = `Explore the ${title} collection.`;
        image = asset(field(collection, [
          "image_path", "cover_image", "cover_path",
          "image", "image_url", "cover"
        ]));
      }
    }

    // A product share must have an image for its preview.
    if (kind === "product" && !image) {
      image = `${SITE}/2026/product-preview.jpg`;
    }

    const canonical = new URL(req.url, SITE);
    canonical.protocol = "https:";
    canonical.host = new URL(SITE).host;

    const tags = [
      ["og:type", "website"],
      ["og:site_name", "Firework Catalogue"],
      ["og:title", title],
      ["og:description", description],
      ["og:url", canonical.href],
      ["twitter:card", image ? "summary_large_image" : "summary"],
      ["twitter:title", title],
      ["twitter:description", description]
    ];

    if (image) {
      tags.push(["og:image", image], ["twitter:image", image]);
    }

    const metadata = tags.map(([key, value]) =>
      `<meta property="${key}" content="${escapeHTML(value)}">`
    ).join("\n");

    html = html.replace(/<title>[\s\S]*?<\/title>/i,
      `<title>${escapeHTML(title)}</title>`);

    html = html.replace(/<\/head>/i, `${metadata}\n</head>`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).send(html);
  } catch (error) {
    console.error("Share metadata error:", error);
    res.status(500).send("Unable to load catalogue.");
  }
}
