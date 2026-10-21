/*
    index.html is in the parent folder.
    All CSV files and product media are inside ./2026/
*/

const DATA_FILES = {
    products: "2026/products.csv",
    categories: "2026/categories.csv",
    collections: "2026/collections.csv",
    items: "2026/collection-items.csv"
};

const modal = document.getElementById("video-modal");
const modalTitle = document.getElementById("modal-title");
const videoFrame = document.getElementById("video-frame");
const closeButton = document.getElementById("modal-close");

let products = [];
let categories = [];
let collections = [];
let collectionItems = [];
let lastFocusedElement = null;
let currentVideo = null;

const colorNames = ["gold", "red", "green", "purple"];

/* ---------- CSV loading and parsing ---------- */

function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    text = text.replace(/^\uFEFF/, "");

    for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
        if (char === '"' && next === '"') {
        field += '"';
        i++;
        } else if (char === '"') {
        inQuotes = false;
        } else {
        field += char;
        }
    } else if (char === '"' && field.length === 0) {
        inQuotes = true;
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

    if (rows.length === 0) return [];

    const headers = rows[0].map(header =>
    header.trim().toLowerCase().replace(/[\s-]+/g, "_")
    );

    return rows.slice(1).map(values => {
    const result = {};
    headers.forEach((header, index) => {
        result[header] = values[index] ?? "";
    });
    return result;
    });
}

async function loadCSV(path, fallback="") {
    const response = await fetch(path, { cache: "no-store" });

    if(response.status===404&&fallback)return loadCSV(fallback);
    if (!response.ok) {
    throw new Error(
        `Could not load ${path} (HTTP ${response.status}).`
    );
    }

    return parseCSV(await response.text());
}

function getField(row, aliases) {
    for (const alias of aliases) {
    const value = row[alias];
    if (value !== undefined && value !== null && value !== "") {
        return String(value).trim();
    }
    }
    return "";
}

function normalize(value){return String(value??"").trim()}
function uniqueMatch(rows,ref,keys){if(!normalize(ref))return null;const matches=rows.filter(row=>keys.some(key=>sameId(row[key],ref)));return matches.length===1?matches[0]:null}
function reference(row,groups){for(const [kind,keys] of groups)for(const key of keys)if(Object.hasOwn(row,key))return {kind,value:normalize(row[key])};return {kind:"",value:""}}
function resolveReference(rows,ref,groups){if(!ref.value)return null;for(const keys of groups[ref.kind]||[]){const matches=rows.filter(row=>keys.some(key=>sameId(row[key],ref.value)));if(matches.length)return matches.length===1?matches[0]:null}return null}
function resolveCategory(row){const ref=reference(row,[["id",["category_id"]],["code",["category_code"]],["generic",["category","product_category","type"]],["name",["category_name","category_title"]]]);return resolveReference(categories,ref,{id:[["category_id","id"]],code:[["category_code","code","slug"]],name:[["category_name","name","title","category","category_title"]],generic:[["category_id","id","category_code","code","slug"],["category_name","name","title","category","category_title"]]})}

function toBoolean(value) {
    return ["true", "1", "yes", "y"].includes(
    String(value ?? "").trim().toLowerCase()
    );
}

/*
    CSV media paths are relative to the 2026 folder.
    Example: 001_PM5050N/example.mp4
    Result:   2026/001_PM5050N/example.mp4
*/

function mediaURL(path) {
    if (!path) return "";

    const cleaned = String(path)
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");

    if (!cleaned) return "";

    if (/^(https?:|data:|blob:)/i.test(cleaned)) {
    return cleaned;
    }

    if (cleaned.startsWith("2026/")) {
    return cleaned;
    }

    return "2026/" + cleaned;
}

function productMediaURL(row,path){if(!path)return "";const folder=getField(row,["folder","folder_path","product_folder","directory","folder_name"]);const value=String(path).replace(/\\/g,"/");return mediaURL(folder&&!value.includes("/")?folder+"/"+value:value)}

function getProductCode(row) {
    return getField(row, [
    "product_code", "code", "sku", "product_id",
    "id", "item_code", "item_id"
    ]);
}

function getProductName(row) {
    return getField(row, [
    "product_name", "name", "title", "product",
    "item_name", "display_name"
    ]);
}

function getProductCategory(row) {
    return getField(row, [
    "category_name", "category", "category_title",
    "category_id", "type", "product_category"
    ]);
}

function getImagePath(row) {
    return getField(row, [
    "image_path", "image", "image_url", "image_file",
    "photo_path", "photo", "thumbnail", "thumbnail_path", "image_filename"
    ]);
}

function getVideoPath(row) {
    return getField(row, [
    "video_path", "video", "video_url", "video_file",
    "media_path", "video_filename"
    ]);
}

/* ---------- Normalize loaded data ---------- */

function normalizeProducts(rows) {
    return rows.map((row, index) => {
    const code = getProductCode(row);
    const name = getProductName(row);
    const categoryRow = resolveCategory(row);

    return {
        ...row,
        code: code || `product-${index + 1}`,
        name: name || code || `Product ${index + 1}`,
        category: categoryRow?getCategoryName(categoryRow):"Unassigned",
        categoryRow,source:row,
        image: productMediaURL(row,getImagePath(row)||(getVideoPath(row)?getVideoPath(row).replace(/\.mp4$/i,".jpg"):"")),
        video: productMediaURL(row,getVideoPath(row)),
        color: colorNames[index % colorNames.length]
    };
    });
}

function getCategoryName(row) {
    return getField(row, [
    "category_name", "name", "title",
    "category", "category_title", "category_id", "id"
    ]);
}

function getCollectionName(row) {
    return getField(row, [
    "collection_name", "name", "title",
    "collection", "collection_title", "collection_id", "id"
    ]);
}

function getCollectionId(row) {
    return getField(row, [
    "collection_id", "collection_code", "collection"
    ]);
}

function getItemProductId(row) {
    return getField(row, [
    "product_id", "product_code", "sku",
    "item_id", "item_code", "code", "product"
    ]);
}

function getItemCollectionId(row) {
    return getField(row, [
    "collection_id", "collection_code", "collection"
    ]);
}

function sameId(a, b) {
    return !!normalize(a)&&!!normalize(b)&&normalize(a)===normalize(b);
}

/* ---------- Render product cards ---------- */

function makeProductArt(product) {
    const art = document.createElement("div");
    art.className = "product-art";

    if (product.image) {
    const image = document.createElement("img");
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";

    image.addEventListener("error", () => {
        image.remove();
        art.appendChild(makeFallbackBox(product));
    }, { once: true });

    art.appendChild(image);
    } else {
    art.appendChild(makeFallbackBox(product));
    }

    return art;
}

function makeFallbackBox(product) {
    const box = document.createElement("div");
    box.className = `firework-box ${product.color}`;

    const label = document.createElement("strong");
    label.textContent = product.name;

    box.appendChild(label);
    return box;
}

function renderProductCard(product) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "product-card";
    card.dataset.productCode = product.code;
    card.setAttribute("aria-label", `View ${product.name}`);

    card.appendChild(makeProductArt(product));

    const info = document.createElement("div");
    info.className = "product-info";

    const name = document.createElement("div");
    name.className = "product-name";
    name.textContent = product.name;

    const type = document.createElement("div");
    type.className = "product-type";
    type.textContent = product.category;

    info.append(name, type);
    card.appendChild(info);

    card.addEventListener("click", () => openProduct(product));

    return card;
}

function renderProductsByCategory() {
    const nav = document.getElementById("category-nav");
    const sections = document.getElementById("catalogue-sections");

    nav.replaceChildren();
    sections.replaceChildren();

    const categoryGroups=categories.map(row=>({row,name:getCategoryName(row)})).filter(group=>group.name);
    if(products.some(product=>!product.categoryRow))categoryGroups.push({row:null,name:"Unassigned"});
    const categoryNames=categoryGroups.map(group=>group.name);

    if (!categoryNames.length) {
    sections.innerHTML =
        '<div class="empty-message">No product categories were found.</div>';
    return;
    }

    categoryNames.forEach((category, index) => {
    const sectionId = `category-${index + 1}`;

    const link = document.createElement("a");
    link.href = `#${sectionId}`;
    link.textContent = category;
    link.addEventListener("click",event=>{if(document.getElementById("selected-collection")){event.preventDefault();renderProductsByCategory();document.getElementById(sectionId)?.scrollIntoView({behavior:"smooth"})}});

    if (index === 0) link.classList.add("active");
    nav.appendChild(link);

    const section = document.createElement("section");
    section.id = sectionId;

    const heading = document.createElement("div");
    heading.className = "section-heading";

    const title = document.createElement("h2");
    title.textContent = category;

    const count = document.createElement("div");
    count.className = "count";

    const items = products.filter(product =>
        product.categoryRow===categoryGroups[index].row
    );

    count.textContent =
        `${items.length} ${items.length === 1 ? "product" : "products"}`;

    heading.append(title, count);

    const grid = document.createElement("div");
    grid.className = "product-grid";

    if (items.length) {
        items.forEach(product => grid.appendChild(renderProductCard(product)));
    } else {
        const empty = document.createElement("div");
        empty.className = "empty-message";
        empty.textContent = "No products in this category yet.";
        grid.appendChild(empty);
    }

    section.append(heading, grid);
    sections.appendChild(section);
    });

    setupCategoryObserver();
}

/* ---------- Render special collection cards ---------- */

function getCollectionProducts(collection){
    const linked=new Set();
    for(const item of collectionItems){
    const collectionRef=reference(item,[["id",["collection_id"]],["code",["collection_code"]],["name",["collection_name"]],["generic",["collection"]]]);
    const target=resolveReference(collections,collectionRef,{id:[["collection_id","id"]],code:[["collection_code","code","slug"]],name:[["collection_name","name","title"]],generic:[["collection_id","id","collection_code","code","slug"],["collection_name","name","title"]]});
    if(target!==collection)continue;
    const productRef=reference(item,[["code",["product_code","sku","item_code","code"]],["id",["product_id","item_id"]],["name",["product_name"]],["generic",["product"]]]);
    const sources=products.map(product=>product.source);
    const source=resolveReference(sources,productRef,{code:[["product_code","code","sku","item_code"]],id:[["product_id","id","item_id"]],name:[["product_name","name","title","product","item_name","display_name"]],generic:[["product_code","code","sku","item_code","product_id","id","item_id"]]});
    const product=products.find(product=>product.source===source);if(product)linked.add(product);
    }
    return products.filter(product=>linked.has(product));
}

function renderCollections() {
    const grid = document.getElementById("collection-grid");
    grid.replaceChildren();

    if (!collections.length) {
    grid.innerHTML =
        '<div class="empty-message">No collections were found in collections.csv.</div>';
    return;
    }

    collections.forEach((collection, index) => {
    const name = getCollectionName(collection) || `Collection ${index + 1}`;
    const assignedProducts = getCollectionProducts(collection);

    const card = document.createElement("button");
    card.type = "button";
    card.className = `collection-card${index % 2 ? " second" : ""}`;
    card.setAttribute("aria-label", `View ${name}`);


    const title = document.createElement("h3");
    title.textContent = name;

    const coverPath=getField(collection,["image_path","cover_image","cover_path","image","image_url","cover"]);
    if(coverPath){const cover=document.createElement("img");cover.className="collection-cover";cover.src=mediaURL(coverPath);cover.alt="";cover.loading="lazy";cover.decoding="async";cover.addEventListener("error",()=>{cover.remove();card.classList.remove("has-cover")},{once:true});card.classList.add("has-cover");card.appendChild(cover)}
    card.append(title);

    card.addEventListener("click", () => {
        showCollection(collection, assignedProducts);
    });

    grid.appendChild(card);
    });
}

function showCollection(collection, items) {
    if(categoryObserver)categoryObserver.disconnect();
    document.querySelectorAll("#category-nav a").forEach(link=>link.classList.remove("active"));
    const name = getCollectionName(collection) || "Collection";
    const sections = document.getElementById("catalogue-sections");

    sections.replaceChildren();

    const section = document.createElement("section");
    section.id = "selected-collection";

    const heading = document.createElement("div");
    heading.className = "section-heading";

    const title = document.createElement("h2");
    title.textContent = name;

    const count = document.createElement("div");
    count.className = "count";
    count.textContent =
    `${items.length} ${items.length === 1 ? "product" : "products"}`;

    heading.append(title, count);

    const grid = document.createElement("div");
    grid.className = "product-grid";

    if (items.length) {
    items.forEach(product => grid.appendChild(renderProductCard(product)));
    } else {
    const empty = document.createElement("div");
    empty.className = "empty-message";
    empty.textContent =
        "No products are linked to this collection. Check collection-items.csv.";
    grid.appendChild(empty);
    }

    const back = document.createElement("button");
    back.type = "button";
    back.className = "category-nav a";
    back.style.cssText =
    "margin-top:24px;padding:10px 18px;border:1px solid var(--border);" +
    "border-radius:999px;background:white;cursor:pointer;font-weight:700;";
    back.textContent = "← Back to all products";
    back.addEventListener("click", () => {
    renderProductsByCategory();
    window.scrollTo({ top: 0, behavior: "smooth" });
    });

    section.append(heading, grid, back);
    sections.appendChild(section);

    section.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- Video/image popup ---------- */

function showUnavailable(message) {
    const text = document.createElement("div");
    text.className = "video-unavailable";
    text.textContent = message;
    videoFrame.replaceChildren(text);
}

function openProduct(product) {
    lastFocusedElement = document.activeElement;
    modalTitle.textContent = product.name;

    videoFrame.replaceChildren();

    if (product.video) {
    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = product.video;

    video.addEventListener("error", () => {
        if (currentVideo !== video) return;

        if (product.image) {
        showProductImage(product);
        } else {
        showUnavailable(
            "This video could not be played. Check the video file path and format."
        );
        }
    });

    currentVideo = video;
    videoFrame.appendChild(video);

    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
        playAttempt.catch(() => {
        // Some browsers require the visitor to press Play.
        });
    }
    } else if (product.image) {
    showProductImage(product);
    } else {
    showUnavailable("No video or image is available for this product.");
    }

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    closeButton.focus();
    scheduleCollections();
}

function showProductImage(product) {
    currentVideo = null;

    const image = document.createElement("img");
    image.src = product.image;
    image.alt = product.name;

    image.addEventListener("error", () => {
    showUnavailable("The product image could not be loaded.");
    }, { once: true });

    videoFrame.replaceChildren(image);
}

function closeProduct() {
    if (!modal.classList.contains("is-open")) return;

    if (currentVideo) {
    currentVideo.pause();
    currentVideo.removeAttribute("src");
    currentVideo.load();
    currentVideo = null;
    }

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    videoFrame.replaceChildren();
    scheduleCollections();

    if (lastFocusedElement && document.contains(lastFocusedElement)) {
    lastFocusedElement.focus();
    }
}

closeButton.addEventListener("click", closeProduct);

modal.addEventListener("click", event => {
    if (event.target === modal) closeProduct();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeProduct();
});

/* ---------- Highlight active category ---------- */

let categoryObserver;

function setupCategoryObserver() {
    if (categoryObserver) categoryObserver.disconnect();

    const links = document.querySelectorAll("#category-nav a");
    const sections = document.querySelectorAll(
    "#catalogue-sections section[id^='category-']"
    );

    if (!("IntersectionObserver" in window)) return;

    categoryObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        links.forEach(link => {
        link.classList.toggle(
            "active",
            link.getAttribute("href") === `#${entry.target.id}`
        );
        });
    });
    }, {
    rootMargin: "-20% 0px -60% 0px"
    });

    sections.forEach(section => categoryObserver.observe(section));
}

/* ---------- Start catalogue ---------- */

async function initCatalogue() {
    try {
    const results = await Promise.all([
        loadCSV(DATA_FILES.products,"2026/products-linked.csv"),
        loadCSV(DATA_FILES.categories),
        loadCSV(DATA_FILES.collections),
        loadCSV(DATA_FILES.items)
    ]);

    categories = results[1];
    products = normalizeProducts(results[0]);
    collections = results[2];
    collectionItems = results[3];

    renderCollections();
    renderProductsByCategory();

    console.info("Catalogue loaded:", {
        products: products.length,
        categories: categories.length,
        collections: collections.length,
        collectionAssignments: collectionItems.length
    });
    } catch (error) {
    console.error("Catalogue loading failed:", error);

    document.getElementById("catalogue-sections").innerHTML = `
        <div class="error-message">
        <strong>Could not load the catalogue.</strong>
        <p>${escapeHTML(error.message)}</p>
        <p>
            Check that index.html is beside the 2026 folder and that
            all four CSV files exist inside 2026.
        </p>
        <p>
            Open the site through a local web server, not by double-clicking
            index.html.
        </p>
        </div>
    `;

    document.getElementById("collection-grid").innerHTML = `
        <div class="error-message">
        Collections could not be loaded. Check the browser console for details.
        </div>
    `;
    }
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
    })[char]);
}

const collectionRail=document.getElementById("collection-grid"),reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
let collectionTimer=0,collectionHover=false,collectionFocus=false,collectionTouch=false;
function scheduleCollections(){clearTimeout(collectionTimer);if(reducedMotion.matches||document.hidden||collectionHover||collectionFocus||collectionTouch||modal.classList.contains("is-open"))return;collectionTimer=setTimeout(()=>{const cards=[...collectionRail.querySelectorAll(".collection-card")],max=collectionRail.scrollWidth-collectionRail.clientWidth;if(cards.length<2||max<=1)return;const origin=collectionRail.getBoundingClientRect().left+parseFloat(getComputedStyle(collectionRail).paddingLeft||0),next=cards.find(card=>card.getBoundingClientRect().left>origin+4);collectionRail.scrollTo({left:collectionRail.scrollLeft>=max-4?0:next?Math.min(max,collectionRail.scrollLeft+next.getBoundingClientRect().left-origin):0,behavior:"smooth"});scheduleCollections()},3500)}
collectionRail.addEventListener("mouseenter",()=>{collectionHover=true;scheduleCollections()});collectionRail.addEventListener("mouseleave",()=>{collectionHover=false;scheduleCollections()});
collectionRail.addEventListener("focusin",()=>{collectionFocus=true;scheduleCollections()});collectionRail.addEventListener("focusout",event=>{collectionFocus=collectionRail.contains(event.relatedTarget);scheduleCollections()});
collectionRail.addEventListener("touchstart",()=>{collectionTouch=true;scheduleCollections()},{passive:true});for(const event of ["touchend","touchcancel"])collectionRail.addEventListener(event,()=>{collectionTouch=false;scheduleCollections()},{passive:true});
collectionRail.addEventListener("scroll",scheduleCollections,{passive:true});document.addEventListener("visibilitychange",scheduleCollections);reducedMotion.addEventListener("change",scheduleCollections);
initCatalogue().then(scheduleCollections);

function shareToken(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  bytes.forEach(byte => binary += String.fromCharCode(byte));

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function shareURL(type, id) {
  const url = new URL(`/${type}`, window.location.origin);
  url.searchParams.set("id", shareToken(id));
  return url.href;
}

async function shareLink(url, title) {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard.");
    }
  } catch (error) {
    if (error.name !== "AbortError") {
      prompt("Copy this link:", url);
    }
  }
}
