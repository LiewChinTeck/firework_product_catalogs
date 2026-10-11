
from pathlib import Path
import pandas as pd

# --------------------------------------------------
# Paths
# --------------------------------------------------
ROOT = Path(__file__).resolve().parent

PRODUCTS_FILE = ROOT / "products.csv"
CATEGORIES_FILE = ROOT / "categories.csv"
COLLECTIONS_FILE = ROOT / "collections.csv"
ITEMS_FILE = ROOT / "collection-items.csv"

OUTPUT_FILE = ROOT / "products-linked.csv"
REPORT_FILE = ROOT / "catalogue-validation.txt"


def read_csv(path):
    if not path.exists():
        raise FileNotFoundError(f"Missing file: {path}")

    # Keep IDs and product codes as strings, preserving leading zeros.
    return pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")


# --------------------------------------------------
# Load CSV files
# --------------------------------------------------
products = read_csv(PRODUCTS_FILE)
categories = read_csv(CATEGORIES_FILE)
collections = read_csv(COLLECTIONS_FILE)
items = read_csv(ITEMS_FILE)

# Trim accidental whitespace from column names.
for df in (products, categories, collections, items):
    df.columns = df.columns.str.strip()

# Required columns
required = {
    "products.csv": (products, {"id", "code", "name", "image", "video", "folder"}),
    "categories.csv": (categories, {"id", "name", "slug"}),
    "collections.csv": (
        collections,
        {"id", "category_id", "name", "slug"},
    ),
    "collection-items.csv": (
        items,
        {"product_id", "category_id", "collection_id"},
    ),
}

for filename, (df, columns) in required.items():
    missing = columns - set(df.columns)
    if missing:
        raise ValueError(f"{filename} is missing columns: {sorted(missing)}")


# --------------------------------------------------
# Normalize product IDs and folder/media paths
# --------------------------------------------------
products["id"] = products["id"].str.strip()
products["folder"] = products["folder"].str.strip()
products["image"] = products["image"].str.strip()
products["video"] = products["video"].str.strip()

items["product_id"] = items["product_id"].str.strip()
items["category_id"] = items["category_id"].str.strip()
items["collection_id"] = items["collection_id"].str.strip()

categories["id"] = categories["id"].str.strip()
collections["id"] = collections["id"].str.strip()
collections["category_id"] = collections["category_id"].str.strip()

# Use paths relative to the catalogue root, with forward slashes
# so they also work in web pages.
def resolve_media_path(folder, filename, extensions):
    if not folder:
        return ""

    folder_path = ROOT / folder

    if not folder_path.is_dir():
        return ""

    # Try the exact CSV filename first.
    if filename:
        exact_path = folder_path / filename
        if exact_path.is_file():
            return exact_path.relative_to(ROOT).as_posix()

    # Fall back to the actual file in the folder, using its extension.
    candidates = [
        p for p in folder_path.iterdir()
        if p.is_file() and p.suffix.lower() in extensions
    ]

    if len(candidates) == 1:
        return candidates[0].relative_to(ROOT).as_posix()

    # Ambiguous or absent files: don't guess.
    return ""


products["image_path"] = products.apply(
    lambda row: resolve_media_path(
        row["folder"], row["image"], {".jpg", ".jpeg", ".png", ".webp"}
    ),
    axis=1,
)

products["video_path"] = products.apply(
    lambda row: resolve_media_path(
        row["folder"], row["video"], {".mp4", ".mov", ".webm", ".m4v"}
    ),
    axis=1,
)

# --------------------------------------------------
# Link product -> collection item -> collection/category
# --------------------------------------------------
# Each product should have one collection assignment in this setup.
duplicate_assignments = items[
    items.duplicated(subset=["product_id"], keep=False)
].sort_values("product_id")

if not duplicate_assignments.empty:
    print("WARNING: Some products have multiple collection assignments.")
    print(duplicate_assignments.to_string(index=False))

if products["id"].duplicated().any():
    duplicates = products.loc[
        products["id"].duplicated(keep=False), "id"
    ].tolist()
    raise ValueError(f"Duplicate product IDs in products.csv: {duplicates}")

if categories["id"].duplicated().any():
    raise ValueError("Duplicate category IDs in categories.csv")

if collections["id"].duplicated().any():
    raise ValueError("Duplicate collection IDs in collections.csv")

# Join the collection-item records to product rows.
linked = products.merge(
    items[["product_id", "category_id", "collection_id"]],
    left_on="id",
    right_on="product_id",
    how="left",
    validate="one_to_one",
)

# Join category names and slugs.
linked = linked.merge(
    categories[["id", "name", "slug"]].rename(
        columns={
            "id": "category_lookup_id",
            "name": "category_name",
            "slug": "category_slug",
        }
    ),
    left_on="category_id",
    right_on="category_lookup_id",
    how="left",
    validate="many_to_one",
)

# Join collection names and slugs.
linked = linked.merge(
    collections[["id", "name", "slug", "category_id"]].rename(
        columns={
            "id": "collection_lookup_id",
            "name": "collection_name",
            "slug": "collection_slug",
            "category_id": "collection_category_id",
        }
    ),
    left_on="collection_id",
    right_on="collection_lookup_id",
    how="left",
    validate="many_to_one",
)

# Flag mismatches where a collection belongs to a different category
# than the product's assigned category.
linked["category_consistent"] = (
    linked["category_id"] == linked["collection_category_id"]
)

# --------------------------------------------------
# Validate media files and assignments
# --------------------------------------------------
def file_exists(relative_path):
    if not relative_path:
        return False
    return (ROOT / Path(relative_path)).is_file()


linked["image_exists"] = linked["image_path"].apply(file_exists)
linked["video_exists"] = linked["video_path"].apply(file_exists)

# A product is validly assigned only if category and collection were found.
linked["assignment_ok"] = (
    linked["category_name"].notna()
    & linked["collection_name"].notna()
    & linked["category_consistent"]
)

# Reorder columns for convenient use by the catalogue website.
preferred_columns = [
    "id",
    "code",
    "name",
    "category_id",
    "category_name",
    "category_slug",
    "collection_id",
    "collection_name",
    "collection_slug",
    "image",
    "image_path",
    "image_exists",
    "video",
    "video_path",
    "video_exists",
    "folder",
    "assignment_ok",
]

# Keep any extra original columns after the main output fields.
output_columns = [c for c in preferred_columns if c in linked.columns]
output_columns += [
    c for c in linked.columns
    if c not in output_columns
    and c not in {
        "product_id",
        "category_lookup_id",
        "collection_lookup_id",
        "collection_category_id",
    }
]

linked[output_columns].to_csv(
    OUTPUT_FILE,
    index=False,
    encoding="utf-8-sig",
)

# --------------------------------------------------
# Validation report
# --------------------------------------------------
product_ids = set(products["id"])
assigned_ids = set(items["product_id"])
category_ids = set(categories["id"])
collection_ids = set(collections["id"])

unassigned_products = sorted(product_ids - assigned_ids)
unknown_products = sorted(assigned_ids - product_ids)
unknown_categories = sorted(set(items["category_id"]) - category_ids)
unknown_collections = sorted(set(items["collection_id"]) - collection_ids)

missing_images = linked.loc[
    (linked["image"] != "") & ~linked["image_exists"],
    ["id", "name", "image_path"],
]
missing_videos = linked.loc[
    (linked["video"] != "") & ~linked["video_exists"],
    ["id", "name", "video_path"],
]
missing_media = linked.loc[
    (linked["image"] == "") & (linked["video"] == ""),
    ["id", "name", "folder"],
]
bad_assignments = linked.loc[
    ~linked["assignment_ok"],
    ["id", "name", "category_id", "collection_id"],
]
category_mismatches = linked.loc[
    linked["category_id"].notna()
    & linked["collection_category_id"].notna()
    & ~linked["category_consistent"],
    ["id", "name", "category_id", "collection_id"],
]

report_lines = [
    f"Catalogue root: {ROOT}",
    f"Products loaded: {len(products)}",
    f"Categories loaded: {len(categories)}",
    f"Collections loaded: {len(collections)}",
    f"Collection-item assignments: {len(items)}",
    f"Products with no assignment: {len(unassigned_products)}",
    f"Assignments referencing unknown products: {len(unknown_products)}",
    f"Assignments referencing unknown categories: {len(unknown_categories)}",
    f"Assignments referencing unknown collections: {len(unknown_collections)}",
    f"Missing image files referenced by CSV: {len(missing_images)}",
    f"Missing video files referenced by CSV: {len(missing_videos)}",
    f"Products with no media filename: {len(missing_media)}",
    f"Products with invalid assignments: {len(bad_assignments)}",
    f"Collection/category mismatches: {len(category_mismatches)}",
    "",
    f"Unassigned product IDs: {unassigned_products}",
    f"Unknown product IDs in collection-items: {unknown_products}",
    f"Unknown category IDs: {unknown_categories}",
    f"Unknown collection IDs: {unknown_collections}",
    "",
    "MISSING IMAGE FILES:",
    missing_images.to_string(index=False),
    "",
    "MISSING VIDEO FILES:",
    missing_videos.to_string(index=False),
    "",
    "PRODUCTS WITH NO MEDIA:",
    missing_media.to_string(index=False),
    "",
    "INVALID ASSIGNMENTS:",
    bad_assignments.to_string(index=False),
    "",
    "CATEGORY MISMATCHES:",
    category_mismatches.to_string(index=False),
]

REPORT_FILE.write_text("\n".join(report_lines), encoding="utf-8")

print(f"Created: {OUTPUT_FILE.name}")
print(f"Created: {REPORT_FILE.name}")
print(f"Products linked: {int(linked['assignment_ok'].sum())}/{len(products)}")
print(f"Missing images: {len(missing_images)}")
print(f"Missing videos: {len(missing_videos)}")
print(f"Unassigned products: {len(unassigned_products)}")
print()
print("Review catalogue-validation.txt for any issues.")
