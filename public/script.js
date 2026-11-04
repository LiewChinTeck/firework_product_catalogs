
// ==========================================
// FIREWORK PRODUCT CATALOGUE
// ==========================================

const DATA_PATH = "2026/data/";
const MEDIA_PATH = "2026/media/";

const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("searchInput");
const categoryFilters = document.getElementById("categoryFilters");
const productCount = document.getElementById("productCount");
const emptyState = document.getElementById("emptyState");

const videoViewer = document.getElementById("videoViewer");
const productVideo = document.getElementById("productVideo");
const closeVideoButton = document.getElementById("closeVideo");


// ==========================================
// DATA
// ==========================================

let products = [];
let categories = [];
let collections = [];

let productCategories = [];
let productCollections = [];

let activeCategory = "all";
let activeCollection = "all";
let videoHistoryOpen = false;


// ==========================================
// CSV PARSER
// Supports quoted fields, commas and newlines
// ==========================================

function parseCSV(text) {
    const rows = [];

    let row = [];
    let value = "";
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && insideQuotes && next === '"') {
            value += '"';
            i++;
        } else if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === "," && !insideQuotes) {
            row.push(value);
            value = "";
        } else if (
            (char === "\n" || char === "\r") &&
            !insideQuotes
        ) {
            if (char === "\r" && next === "\n") i++;

            row.push(value);

            if (row.some(item => item.trim() !== "")) {
                rows.push(row);
            }

            row = [];
            value = "";
        } else {
            value += char;
        }
    }

    if (value.length || row.length) {
        row.push(value);
        rows.push(row);
    }

    if (!rows.length) return [];

    const headers = rows.shift().map(header =>
        header.trim().replace(/^\uFEFF/, "")
    );

    return rows.map(values => {
        const object = {};

        headers.forEach((header, index) => {
            object[header] = (values[index] || "").trim();
        });

        return object;
    });
}


// ==========================================
// LOAD CSV
// ==========================================

async function loadCSV(filename) {
    const response = await fetch(DATA_PATH + filename);

    if (!response.ok) {
        throw new Error(
            `Unable to load ${filename}: ${response.status}`
        );
    }

    const text = await response.text();

    return parseCSV(text);
}


// ==========================================
// LOAD ALL DATA
// ==========================================

async function loadCatalogue() {
    try {
        const [
            productData,
            categoryData,
            collectionData,
            productCategoryData,
            productCollectionData
        ] = await Promise.all([

            loadCSV("products.csv"),
            loadCSV("categories.csv"),
            loadCSV("collections.csv"),
            loadCSV("product-category.csv"),
            loadCSV("product-collection.csv")

        ]);

        products = productData;
        categories = categoryData;
        collections = collectionData;

        productCategories = productCategoryData;
        productCollections = productCollectionData;

        // Link category IDs to each product ID
        products.forEach(product => {

            product.categoryIds = productCategories
                .filter(row =>
                    String(row.product_id) === String(product.id)
                )
                .map(row => String(row.category_id));

        });

        // Link collection IDs to each product ID
        products.forEach(product => {

            const relations = productCollections
                .filter(row =>
                    String(row.product_id) === String(product.id)
                )
                .sort((a, b) =>
                    Number(a.sort_order || 0) -
                    Number(b.sort_order || 0)
                );

            product.collectionIds = relations.map(row =>
                String(row.collection_id)
            );

        });

        // Sort master data
        categories.sort((a, b) =>
            Number(a.sort_order || 0) -
            Number(b.sort_order || 0)
        );

        collections.sort((a, b) =>
            Number(a.sort_order || 0) -
            Number(b.sort_order || 0)
        );

        renderFilters();
        renderProducts();

    } catch (error) {

        console.error("Catalogue loading error:", error);

        productCount.textContent = "Loading error";

        emptyState.hidden = false;
        emptyState.innerHTML = `
            <div>✧</div>
            <p>${escapeHTML(error.message)}</p>
            <p>Please check your CSV folder and filenames.</p>
        `;
    }
}


// ==========================================
// SAFE HTML
// ==========================================

function escapeHTML(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[char]
    );
}


// ==========================================
// MEDIA PATH GENERATOR
// ==========================================

function getProductFolder(product) {

    const paddedID = String(product.id).padStart(3, "0");

    return (
        MEDIA_PATH +
        paddedID +
        "_" +
        encodeURIComponent(product.code)
        + "/"
    );
}


function getProductImage(product) {

    return (
        getProductFolder(product) +
        encodeURIComponent(product.name) +
        ".jpg"
    );
}


function getProductVideo(product) {

    return (
        getProductFolder(product) +
        encodeURIComponent(product.name) +
        ".mp4"
    );
}


// Example:
// ID: 1
// Code: abc
// Name: text123
//
// Image: media/001_abc/text123.jpg
// Video: media/001_abc/text123.mp4
//
// ID: 34
// Code: efg
// Name: word with space
//
// Image: media/034_efg/word%20with%20space.jpg
// Video: media/034_efg/word%20with%20space.mp4
//
// Note: The folder code must match the CSV code.


// ==========================================
// CATEGORY FILTERS
// ==========================================

function renderFilters() {

    let html = `
        <button
            class="category-btn active"
            data-category="all"
        >
            All Products
        </button>
    `;

    categories.forEach(category => {

        html += `
            <button
                class="category-btn"
                data-category="${escapeHTML(category.id)}"
            >
                ${escapeHTML(category.name)}
            </button>
        `;

    });

    categoryFilters.innerHTML = html;
}


// ==========================================
// FILTER EVENTS
// ==========================================

categoryFilters.addEventListener("click", event => {

    const button = event.target.closest("[data-category]");

    if (!button) return;

    activeCategory = button.dataset.category;

    categoryFilters
        .querySelectorAll(".category-btn")
        .forEach(item => item.classList.remove("active"));

    button.classList.add("active");
button.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
    inline: "center"
});

    renderProducts();

});


// ==========================================
// PRODUCT SEARCH
// ==========================================

searchInput.addEventListener("input", () => {
    renderProducts();
});

// Dynamic search placeholder
const searchHints = [
    "Search by product name...",
    "Try product code...",
    "Search by product ID..."
];

let hintIndex = 0;

setInterval(() => {
    if (
        document.activeElement !== searchInput &&
        !searchInput.value
    ) {
        hintIndex = (hintIndex + 1) % searchHints.length;
        searchInput.placeholder = searchHints[hintIndex];
    }
}, 2500);

// Clear Search
const clearSearch = document.getElementById("clearSearch");

searchInput.addEventListener("input", () => {
    clearSearch.hidden = !searchInput.value;
    renderProducts();
});

clearSearch.addEventListener("click", () => {
    searchInput.value = "";
    clearSearch.hidden = true;
    searchInput.focus();
    renderProducts();
});

// ==========================================
// PRODUCT FILTER
// ==========================================

function getFilteredProducts() {

    const keyword = searchInput.value
        .trim()
        .toLowerCase();

    return products
        .filter(product => {

            const matchesSearch =
                String(product.id || "").toLowerCase().includes(keyword) ||
                String(product.name || "").toLowerCase().includes(keyword) ||
                String(product.eng_name || "").toLowerCase().includes(keyword) ||
                String(product.code || "").toLowerCase().includes(keyword) ||
                String(product.desc || "").toLowerCase().includes(keyword);

            const matchesCategory =
                activeCategory === "all" ||
                product.categoryIds.includes(activeCategory);

            return matchesSearch && matchesCategory;

        })
        .sort((a, b) => Number(b.id) - Number(a.id));

}


// ==========================================
// RENDER PRODUCT CARDS
// ==========================================

function renderProducts() {

    const filteredProducts = getFilteredProducts();

    const targetCount = filteredProducts.length;

    productCount.classList.remove("count-pop");

    // Restart animation
    void productCount.offsetWidth;

    productCount.textContent = `${targetCount} Products`;
    productCount.classList.add("count-pop");

    emptyState.hidden = filteredProducts.length !== 0;

    productGrid.innerHTML = filteredProducts.map(product => {

        const image = escapeHTML(getProductImage(product));

        return `
            <button
                class="product-card"
                type="button"
                data-product-id="${escapeHTML(product.id)}"
                aria-label="Play ${escapeHTML(product.name)}"
            >

                <!-- CHINESE NEW YEAR LANTERN -->
                <span
                    class="card-lantern"
                    data-share-product="${escapeHTML(product.id)}"
                    title="Share product"
                >
                    <img src="2026/media/lantern.svg" alt="">
                </span>
                <div class="product-image-wrapper">
                    <span class="product-id">${escapeHTML(product.id)} </span>

                    <img
                        class="product-image"
                        src="${image}"
                        alt="${escapeHTML(product.name)}"
                        loading="lazy"
                        onerror="
                            this.style.display='none';
                            this.nextElementSibling.style.display='grid';
                        "
                    >

                    <div class="image-placeholder">
                        ✦
                    </div>

                    <span class="play-icon">▶</span>

                </div>

                <div class="product-info">

                    <div class="product-code">
                        ${escapeHTML(product.code)}
                    </div>

                    <div class="product-name">
                        ${escapeHTML(product.name)}
                    </div>
                    <div class="product-eng-name">
                        ${escapeHTML(product.eng_name)}
                    </div>
                    <div class="card-fireworks">
                        <img src="2026/media/fireworks.gif" class="fw">
                    </div>
                </div>

            </button>
        `;

    }).join("");
    refreshCardLanterns();
}


// ==========================================
// PRODUCT CLICK / SHARE CLICK
// ==========================================

productGrid.addEventListener("click", event => {

    // SHARE LANTERN
    const lantern = event.target.closest(".card-lantern");

    if (lantern) {

        event.preventDefault();
        event.stopPropagation();

        const productId = lantern.dataset.shareProduct;

        shareProduct(productId);

        return;
    }

    // PLAY PRODUCT VIDEO
    const card = event.target.closest("[data-product-id]");

    if (!card) return;

    const product = products.find(item =>
        String(item.id) === card.dataset.productId
    );

    if (!product) return;

    openProductVideo(product);

});


// ==========================================
// OPEN FULLSCREEN VIDEO
// ==========================================

function openProductVideo(product) {

    const videoPath = getProductVideo(product);

    productVideo.pause();
    productVideo.removeAttribute("src");
    productVideo.load();

    productVideo.src = videoPath;

    videoViewer.classList.add("open");
    videoViewer.setAttribute("aria-hidden", "false");

    document.body.classList.add("video-open");

    // Add browser history state.
    // Phone back button will close the video.
    if (!videoHistoryOpen) {

        history.pushState(
            { productVideo: true },
            "",
            window.location.href
        );

        videoHistoryOpen = true;

    }

    // Play video
    productVideo.play().catch(error => {
        console.log("Video autoplay blocked:", error);
    });

}


// ==========================================
// CLOSE VIDEO
// ==========================================

function closeProductVideo(fromBackButton = false) {

    if (!videoViewer.classList.contains("open")) {
        return;
    }

    videoViewer.classList.remove("open");

    videoViewer.setAttribute("aria-hidden", "true");

    productVideo.pause();

    productVideo.removeAttribute("src");

    productVideo.load();

    document.body.classList.remove("video-open");

    if (videoHistoryOpen && !fromBackButton) {

        history.back();

    }

    videoHistoryOpen = false;

}


// X BUTTON
closeVideoButton.addEventListener("click", () => {
    closeProductVideo();
});


// PHONE BACK BUTTON
window.addEventListener("popstate", () => {

    if (videoViewer.classList.contains("open")) {

        closeProductVideo(true);

    }

});


// ESC KEY
document.addEventListener("keydown", event => {

    if (event.key === "Escape") {

        closeProductVideo();

    }

});

// ==========================================
// SHARE PRODUCT
// ==========================================

async function shareProduct(productId) {

    const product = products.find(item =>
        String(item.id) === String(productId)
    );

    if (!product) return;

    const shareURL =
        `https://fireworkproductcatalogs.vercel.app/share/${encodeURIComponent(product.id)}`;

    const shareData = {
        title: product.name,
        text: `${product.name} - ${product.code}`,
        url: shareURL
    };

    try {

        if (navigator.share) {

            await navigator.share(shareData);

        } else {

            await navigator.clipboard.writeText(shareURL);

            alert("Product link copied!");

        }

    } catch (error) {

        if (error.name !== "AbortError") {
            console.error("Sharing failed:", error);
        }

    }

}

// ==========================================
// INITIALIZE
// ==========================================

loadCatalogue();
// ==========================================
// SMOOTH SCROLL-DRIVEN LANTERN ANIMATION
// ==========================================

let cardLanterns = [];

let lastLanternScrollY = window.scrollY;
let scrollVelocity = 0;
let smoothScrollVelocity = 0;
let lanternLastTime = performance.now();

function refreshCardLanterns() {

    cardLanterns = [
        ...productGrid.querySelectorAll(".card-lantern")
    ].map(element => ({
        element,
        angle: 0,
        velocity: 0,

        sensitivity: 0.75 + Math.random() * 0.7,
        spring: 0.035 + Math.random() * 0.012,
        damping: 0.88 + Math.random() * 0.035,
        maxAngle: 22 + Math.random() * 10,

        phase: Math.random() * Math.PI * 2,
        speed: 0.001 + Math.random() * 0.0005
    }));

}

// Capture actual scrolling speed
window.addEventListener("scroll", () => {

    const currentY = window.scrollY;
    const delta = currentY - lastLanternScrollY;

    scrollVelocity += delta * 0.8;

    scrollVelocity = Math.max(
        -35,
        Math.min(35, scrollVelocity)
    );

    lastLanternScrollY = currentY;

}, { passive: true });


// Smooth animation
function animateCardLanterns(time) {

    const deltaTime = Math.min(
        (time - lanternLastTime) / 16.67,
        2
    );

    lanternLastTime = time;

    // Smooth scroll velocity
    smoothScrollVelocity +=
        (scrollVelocity - smoothScrollVelocity) * 0.25;

    scrollVelocity *= 0.90;

    cardLanterns.forEach(lantern => {

        // Scrolling adds momentum, not a fixed angle
        const scrollForce =
            smoothScrollVelocity *
            lantern.sensitivity *
            0.10;

        lantern.velocity += scrollForce * deltaTime;

        // Spring gently pulls toward resting position
        lantern.velocity +=
            -lantern.angle * lantern.spring * deltaTime;

        // Natural friction
        lantern.velocity *= Math.pow(
            lantern.damping,
            deltaTime
        );

        // Update current swing angle
        lantern.angle += lantern.velocity * deltaTime;

        lantern.angle = Math.max(
            -lantern.maxAngle,
            Math.min(lantern.maxAngle, lantern.angle)
        );

        lantern.element.style.transform =
            `rotate(${lantern.angle}deg)`;

    });

    requestAnimationFrame(animateCardLanterns);
}


// Start
refreshCardLanterns();
requestAnimationFrame(animateCardLanterns);

// ==========================================
// SCROLL-UP SEARCH BAR
// ==========================================

const searchSection = document.querySelector(".search-section");
const categorySection = document.querySelector(".category-section");

let lastScrollY = window.scrollY;

const scrollThreshold = 8;

window.addEventListener("scroll", () => {

    const currentScrollY = window.scrollY;
    const difference = currentScrollY - lastScrollY;

    if (Math.abs(difference) < scrollThreshold) {
        return;
    }

    // SCROLL DOWN
    if (difference > 0 && currentScrollY > 100) {

        searchSection.classList.add("search-hidden");
        categorySection.classList.remove("search-visible");

    }

    // SCROLL UP
    else if (difference < 0) {

        searchSection.classList.remove("search-hidden");
        categorySection.classList.add("search-visible");

    }

    categorySection.classList.toggle(
        "sticky-active",
        currentScrollY > 10
    );

    lastScrollY = currentScrollY;

}, { passive: true });