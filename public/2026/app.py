
import time
import csv
import os
import re
import shutil
import tempfile
from pathlib import Path

from flask import Flask, flash, redirect, render_template_string, request, url_for
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = "change-this-secret-key"

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
MEDIA = BASE / "media"

FILES = {
    "products": DATA / "products.csv",
    "categories": DATA / "categories.csv",
    "collections": DATA / "collections.csv",
    "product-category": DATA / "product-category.csv",
    "product-collection": DATA / "product-collection.csv",
}

FIELDS = {
    "products": ["id", "code", "name", "description"],
    "categories": ["id", "name", "slug", "sort_order"],
    "collections": [
        "id", "name", "slug", "sort_order", "image_path", "description"
    ],
    "product-category": ["product_id", "category_id"],
    "product-collection": [
        "product_id", "category_id", "collection_id", "sort_order"
    ],
}

ALLOWED_IMAGE = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_VIDEO = {".mp4", ".webm", ".mov", ".m4v"}


def initialize():
    DATA.mkdir(parents=True, exist_ok=True)
    MEDIA.mkdir(parents=True, exist_ok=True)

    for kind, path in FILES.items():
        if not path.exists():
            with path.open("w", newline="", encoding="utf-8-sig") as f:
                csv.DictWriter(f, fieldnames=FIELDS[kind]).writeheader()


def read_rows(kind):
    with FILES[kind].open("r", newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_rows(kind, rows):
    path = FILES[kind]
    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            "w",
            newline="",
            encoding="utf-8-sig",
            dir=str(path.parent),
            suffix=".tmp",
            delete=False,
        ) as temp:
            writer = csv.DictWriter(
                temp,
                fieldnames=FIELDS[kind],
                extrasaction="ignore",
            )
            writer.writeheader()
            writer.writerows(rows)
            temp_path = temp.name

        for attempt in range(5):
            try:
                os.replace(temp_path, path)
                temp_path = None
                return
            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(0.5)
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass


def next_id(kind):
    ids = []

    for row in read_rows(kind):
        try:
            ids.append(int(row.get("id", "")))
        except (TypeError, ValueError):
            continue

    return max(ids, default=0) + 1


def get_record(kind, record_id):
    return next(
        (
            row for row in read_rows(kind)
            if str(row.get("id", "")) == str(record_id)
        ),
        None,
    )


def safe_slug(value):
    return re.sub(
        r"[^a-z0-9]+",
        "-",
        value.strip().lower(),
    ).strip("-")


def safe_name(value):
    return Path(secure_filename(value or "file")).stem or "file"


def product_folder(product_id, code):
    return MEDIA / f"{int(product_id):03d}_{safe_name(code)}"


def validate_upload(upload, allowed, label):
    if not upload or not upload.filename:
        return None

    ext = Path(upload.filename).suffix.lower()

    if ext not in allowed:
        raise ValueError(
            f"Invalid {label} format. Allowed: "
            f"{', '.join(sorted(allowed))}"
        )

    return ext


def save_upload(upload, destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=str(destination.parent),
            prefix="upload_",
            suffix=".tmp",
            delete=False,
        ) as temp:
            temp_path = Path(temp.name)
            upload.save(temp)

        for attempt in range(5):
            try:
                if destination.exists() and destination.is_dir():
                    raise IsADirectoryError(destination)

                # Replace the existing file.
                os.replace(temp_path, destination)
                temp_path = None
                return

            except PermissionError:
                if attempt == 4:
                    raise
                time.sleep(0.5)

    finally:
        if temp_path and temp_path.exists():
            try:
                temp_path.unlink()
            except OSError:
                pass


def replace_product_media(upload, folder, filename):
    folder = Path(folder).resolve()
    media_root = MEDIA.resolve()

    if folder.parent != media_root:
        raise ValueError(f"Invalid product folder: {folder}")

    if not folder.exists() or not folder.is_dir():
        raise FileNotFoundError(
            f"Product folder does not exist: {folder}"
        )

    destination = folder / Path(filename).name
    save_upload(upload, destination)

    return destination.name


def remove_old_product_media(folder, product_name, keep_extension):
    """
    Remove previous files with the same product name but a different
    extension, so only the required JPG or MP4 remains.
    """
    folder = Path(folder)

    if not folder.exists():
        return

    for path in folder.iterdir():
        if not path.is_file():
            continue

        if path.stem == product_name and path.suffix.lower() != keep_extension:
            try:
                path.unlink()
            except OSError:
                pass


def render_page(title, content, **context):
    template = """
    <!doctype html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ title }}</title>
    <style>
    body {
        font-family: Arial, sans-serif;
        max-width: 1100px;
        margin: 30px auto;
        padding: 0 16px;
        color: #222;
    }
    nav {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 24px;
    }
    nav a {
        padding: 9px 12px;
        background: #eee;
        border-radius: 6px;
        text-decoration: none;
        color: #222;
    }
    form {
        display: grid;
        gap: 12px;
        max-width: 720px;
    }
    label {
        font-weight: 600;
        display: grid;
        gap: 6px;
    }
    input, textarea, select, button {
        font: inherit;
        padding: 9px;
        border: 1px solid #ccc;
        border-radius: 5px;
    }
    button {
        background: #222;
        color: white;
        cursor: pointer;
        border: 0;
    }
    table {
        border-collapse: collapse;
        width: 100%;
        margin: 12px 0 28px;
    }
    th, td {
        text-align: left;
        padding: 8px;
        border-bottom: 1px solid #ddd;
        vertical-align: top;
    }
    .notice {
        padding: 10px;
        background: #f4f4f4;
        border-radius: 6px;
        margin: 12px 0;
    }
    </style>
    </head>
    <body>
    <nav>
    <a href="{{ url_for('index') }}">Home</a>
    <a href="{{ url_for('product_form') }}">Add product</a>
    <a href="{{ url_for('category_form') }}">Add category</a>
    <a href="{{ url_for('collection_form') }}">Add collection</a>
    <a href="{{ url_for('links_form') }}">Link products</a>
    <a href="{{ url_for('records') }}">Records / Edit</a>
    </nav>

    {% with messages = get_flashed_messages(with_categories=true) %}
    {% for category, message in messages %}
    <div class="notice {{ category }}">{{ message }}</div>
    {% endfor %}
    {% endwith %}

    <h1>{{ title }}</h1>
    """ + content + """
    </body>
    </html>
    """

    return render_template_string(
        template,
        title=title,
        products=read_rows("products"),
        categories=read_rows("categories"),
        collections=read_rows("collections"),
        **context,
    )


@app.route("/")
def index():
    return render_page(
        "Product Manager",
        """
        <p>Manage products, categories, collections, and their links.</p>
        <ul>
        <li>Products: {{ products|length }}</li>
        <li>Categories: {{ categories|length }}</li>
        <li>Collections: {{ collections|length }}</li>
        </ul>
        """,
    )


@app.route("/product", methods=["GET", "POST"])
def product_form():
    if request.method == "POST":
        try:
            code = request.form.get("code", "").strip()
            name = request.form.get("name", "").strip()
            description = request.form.get("description", "").strip()

            image = request.files.get("image")
            video = request.files.get("video")

            if not code or not name:
                raise ValueError(
                    "Product code and name are required."
                )

            validate_upload(image, ALLOWED_IMAGE, "image")
            validate_upload(video, ALLOWED_VIDEO, "video")

            if not image or not image.filename:
                raise ValueError("An image is required.")

            if not video or not video.filename:
                raise ValueError("A video is required.")

            product_id = next_id("products")
            folder = product_folder(product_id, code)

            if folder.exists():
                raise FileExistsError(
                    f"Product folder already exists: {folder}"
                )

            folder.mkdir(parents=True)

            # Always use .jpg and .mp4 filenames.
            image_name = f"{name}.jpg"
            video_name = f"{name}.mp4"

            try:
                save_upload(image, folder / image_name)
                save_upload(video, folder / video_name)

                rows = read_rows("products")
                rows.append({
                    "id": f"{product_id:03d}",
                    "code": code,
                    "name": name,
                    "description": description,
                })

                write_rows("products", rows)

            except Exception:
                shutil.rmtree(folder, ignore_errors=True)
                raise

            flash(
                f"Product {product_id:03d} added successfully.",
                "success",
            )
            return redirect(url_for("records"))

        except Exception as exc:
            flash(f"Could not add product: {exc}", "error")

    return render_page(
        "Add product",
        """
        <form method="post" enctype="multipart/form-data">
          <label>
            Product code
            <input name="code" required>
          </label>

          <label>
            Product name
            <input name="name" required>
          </label>

          <label>
            Image
            <input
                type="file"
                name="image"
                accept=".jpg,.jpeg,.png,.webp,.gif"
                required
            >
          </label>

          <label>
            Video
            <input
                type="file"
                name="video"
                accept=".mp4,.webm,.mov,.m4v"
                required
            >
          </label>

          <label>
            Description
            <textarea name="description" rows="4"></textarea>
          </label>

          <button type="submit">Add product</button>
        </form>
        """,
    )


@app.route("/category", methods=["GET", "POST"])
def category_form():
    if request.method == "POST":
        try:
            name = request.form.get("name", "").strip()
            slug = (
                request.form.get("slug", "").strip()
                or safe_slug(name)
            )
            sort_order = (
                request.form.get("sort_order", "0").strip() or "0"
            )

            if not name:
                raise ValueError("Category name is required.")

            rows = read_rows("categories")
            category_id = next_id("categories")

            rows.append({
                "id": category_id,
                "name": name,
                "slug": slug,
                "sort_order": sort_order,
            })

            write_rows("categories", rows)
            flash("Category added.", "success")
            return redirect(url_for("records"))

        except Exception as exc:
            flash(f"Could not add category: {exc}", "error")

    return render_page(
        "Add category",
        """
        <form method="post">
          <label>
            Name
            <input name="name" required>
          </label>

          <label>
            Slug
            <input name="slug">
          </label>

          <label>
            Sort order
            <input name="sort_order" type="number" value="0">
          </label>

          <button type="submit">Add category</button>
        </form>
        """,
    )


@app.route("/collection", methods=["GET", "POST"])
def collection_form():
    if request.method == "POST":
        try:
            name = request.form.get("name", "").strip()
            slug = (
                request.form.get("slug", "").strip()
                or safe_slug(name)
            )
            sort_order = (
                request.form.get("sort_order", "0").strip() or "0"
            )
            description = request.form.get(
                "description", ""
            ).strip()

            code = safe_name(
                request.form.get("code", "").strip()
                or f"SC{next_id('collections'):02d}"
            )

            image = request.files.get("image")
            image_ext = validate_upload(
                image, ALLOWED_IMAGE, "cover image"
            )

            if not name:
                raise ValueError("Collection name is required.")

            collection_id = next_id("collections")
            image_path = ""

            if image_ext:
                filename = f"cover{image_ext}"
                save_upload(
                    image,
                    MEDIA / "collections" / code / filename,
                )
                image_path = f"/collections/{code}/{filename}"

            rows = read_rows("collections")
            rows.append({
                "id": collection_id,
                "name": name,
                "slug": slug,
                "sort_order": sort_order,
                "image_path": image_path,
                "description": description,
            })

            write_rows("collections", rows)
            flash("Collection added.", "success")
            return redirect(url_for("records"))

        except Exception as exc:
            flash(f"Could not add collection: {exc}", "error")

    return render_page(
        "Add collection",
        """
        <form method="post" enctype="multipart/form-data">
          <label>
            Name
            <input name="name" required>
          </label>

          <label>
            Code
            <input name="code" placeholder="e.g. SC01">
          </label>

          <label>
            Slug
            <input name="slug">
          </label>

          <label>
            Sort order
            <input name="sort_order" type="number" value="0">
          </label>

          <label>
            Cover image
            <input
                type="file"
                name="image"
                accept=".jpg,.jpeg,.png,.webp,.gif"
            >
          </label>

          <label>
            Description
            <textarea name="description" rows="4"></textarea>
          </label>

          <button type="submit">Add collection</button>
        </form>
        """,
    )


@app.route("/links", methods=["GET", "POST"])
def links_form():
    if request.method == "POST":
        try:
            product_id = request.form.get(
                "product_id", ""
            ).strip()
            category_id = request.form.get(
                "category_id", ""
            ).strip()
            collection_id = request.form.get(
                "collection_id", ""
            ).strip()
            sort_order = (
                request.form.get("sort_order", "0").strip() or "0"
            )

            if not get_record("products", product_id):
                raise ValueError("Select a valid product.")

            if category_id and not get_record(
                "categories", category_id
            ):
                raise ValueError("Selected category does not exist.")

            if collection_id and not get_record(
                "collections", collection_id
            ):
                raise ValueError("Selected collection does not exist.")

            if not category_id and not collection_id:
                raise ValueError(
                    "Select a category, a collection, or both."
                )

            if category_id:
                rows = read_rows("product-category")

                if not any(
                    r["product_id"] == product_id
                    and r["category_id"] == category_id
                    for r in rows
                ):
                    rows.append({
                        "product_id": product_id,
                        "category_id": category_id,
                    })
                    write_rows("product-category", rows)

            if collection_id:
                rows = read_rows("product-collection")

                if not any(
                    r["product_id"] == product_id
                    and r["category_id"] == category_id
                    and r["collection_id"] == collection_id
                    for r in rows
                ):
                    rows.append({
                        "product_id": product_id,
                        "category_id": category_id,
                        "collection_id": collection_id,
                        "sort_order": sort_order,
                    })
                    write_rows("product-collection", rows)

            flash("Product links saved.", "success")
            return redirect(url_for("records"))

        except Exception as exc:
            flash(f"Could not save links: {exc}", "error")

    return render_page(
        "Link product to category / collection",
        """
        <form method="post">
          <label>
            Product
            <select name="product_id" required>
              <option value="">Select product</option>
              {% for p in products %}
              <option value="{{ p.id }}">
                {{ p.id }} — {{ p.name }} ({{ p.code }})
              </option>
              {% endfor %}
            </select>
          </label>

          <label>
            Category
            <select name="category_id">
              <option value="">None</option>
              {% for c in categories %}
              <option value="{{ c.id }}">
                {{ c.id }} — {{ c.name }}
              </option>
              {% endfor %}
            </select>
          </label>

          <label>
            Collection
            <select name="collection_id">
              <option value="">None</option>
              {% for c in collections %}
              <option value="{{ c.id }}">
                {{ c.id }} — {{ c.name }}
              </option>
              {% endfor %}
            </select>
          </label>

          <label>
            Collection sort order
            <input name="sort_order" type="number" value="0">
          </label>

          <button type="submit">Save links</button>
        </form>
        """,
    )


@app.route("/records")
def records():
    return render_page(
        "Records / Edit",
        """
        <h2>Products</h2>
        <table>
        <tr>
            <th>ID</th>
            <th>Code</th>
            <th>Name</th>
            <th>Generated folder</th>
            <th>Edit</th>
        </tr>
        {% for r in products %}
        <tr>
            <td>{{ '%03d'|format(r.id|int) }}</td>
            <td>{{ r.code }}</td>
            <td>{{ r.name }}</td>
            <td>{{ '%03d'|format(r.id|int) }}_{{ r.code }}</td>
            <td>
                <a href="{{ url_for(
                    'edit_record',
                    kind='products',
                    record_id=r.id
                ) }}">Edit</a>
            </td>
        </tr>
        {% endfor %}
        </table>

        <h2>Categories</h2>
        <table>
        <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Slug</th>
            <th>Edit</th>
        </tr>
        {% for r in categories %}
        <tr>
            <td>{{ r.id }}</td>
            <td>{{ r.name }}</td>
            <td>{{ r.slug }}</td>
            <td>
                <a href="{{ url_for(
                    'edit_record',
                    kind='categories',
                    record_id=r.id
                ) }}">Edit</a>
            </td>
        </tr>
        {% endfor %}
        </table>

        <h2>Collections</h2>
        <table>
        <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Slug</th>
            <th>Image path</th>
            <th>Edit</th>
        </tr>
        {% for r in collections %}
        <tr>
            <td>{{ r.id }}</td>
            <td>{{ r.name }}</td>
            <td>{{ r.slug }}</td>
            <td>{{ r.image_path }}</td>
            <td>
                <a href="{{ url_for(
                    'edit_record',
                    kind='collections',
                    record_id=r.id
                ) }}">Edit</a>
            </td>
        </tr>
        {% endfor %}
        </table>

        <h2>Product-category links</h2>
        <table>
        <tr>
            <th>Product ID</th>
            <th>Category ID</th>
        </tr>
        {% for r in pc_links %}
        <tr>
            <td>{{ r.product_id }}</td>
            <td>{{ r.category_id }}</td>
        </tr>
        {% endfor %}
        </table>

        <h2>Product-collection links</h2>
        <table>
        <tr>
            <th>Product ID</th>
            <th>Category ID</th>
            <th>Collection ID</th>
            <th>Sort order</th>
        </tr>
        {% for r in pcl_links %}
        <tr>
            <td>{{ r.product_id }}</td>
            <td>{{ r.category_id }}</td>
            <td>{{ r.collection_id }}</td>
            <td>{{ r.sort_order }}</td>
        </tr>
        {% endfor %}
        </table>
        """,
        pc_links=read_rows("product-category"),
        pcl_links=read_rows("product-collection"),
    )


@app.route("/edit/<kind>/<record_id>", methods=["GET", "POST"])
def edit_record(kind, record_id):
    if kind not in {"products", "categories", "collections"}:
        return "Unsupported record type", 400

    row = get_record(kind, record_id)

    if not row:
        return "Record not found", 404

    if request.method == "POST":
        try:
            if kind == "products":
                code = request.form.get("code", "").strip()
                name = request.form.get("name", "").strip()
                description = request.form.get(
                    "description", ""
                ).strip()

                if not code or not name:
                    raise ValueError(
                        "Product code and name are required."
                    )

                # Keep the existing product ID and folder unchanged.
                folder = product_folder(row["id"], row["code"])

                image = request.files.get("image")
                video = request.files.get("video")

                if image and image.filename:
                    validate_upload(
                        image, ALLOWED_IMAGE, "image"
                    )

                    image_name = f"{name}.jpg"

                    replace_product_media(
                        image,
                        folder,
                        image_name,
                    )

                    remove_old_product_media(
                        folder,
                        name,
                        ".jpg",
                    )

                if video and video.filename:
                    validate_upload(
                        video, ALLOWED_VIDEO, "video"
                    )

                    video_name = f"{name}.mp4"

                    replace_product_media(
                        video,
                        folder,
                        video_name,
                    )

                    remove_old_product_media(
                        folder,
                        name,
                        ".mp4",
                    )

                # Store only CSV product fields.
                row.update({
                    "code": code,
                    "name": name,
                    "description": description,
                })

            elif kind == "categories":
                name = request.form.get("name", "").strip()

                if not name:
                    raise ValueError("Category name is required.")

                row.update({
                    "name": name,
                    "slug": (
                        request.form.get("slug", "").strip()
                        or safe_slug(name)
                    ),
                    "sort_order": (
                        request.form.get("sort_order", "0").strip()
                        or "0"
                    ),
                })

            else:
                name = request.form.get("name", "").strip()

                if not name:
                    raise ValueError("Collection name is required.")

                row.update({
                    "name": name,
                    "slug": (
                        request.form.get("slug", "").strip()
                        or safe_slug(name)
                    ),
                    "sort_order": (
                        request.form.get("sort_order", "0").strip()
                        or "0"
                    ),
                    "description": request.form.get(
                        "description", ""
                    ).strip(),
                })

                image = request.files.get("image")

                if image and image.filename:
                    ext = validate_upload(
                        image, ALLOWED_IMAGE, "cover image"
                    )

                    code = safe_name(
                        request.form.get("code", "").strip()
                        or f"SC{int(record_id):02d}"
                    )

                    filename = f"cover{ext}"

                    save_upload(
                        image,
                        MEDIA / "collections" / code / filename,
                    )

                    row["image_path"] = (
                        f"/collections/{code}/{filename}"
                    )

            rows = read_rows(kind)

            for index, existing in enumerate(rows):
                if str(existing.get("id")) == str(record_id):
                    rows[index] = row
                    break
            else:
                raise ValueError("Record not found in CSV.")

            write_rows(kind, rows)

            flash(f"{kind} record updated.", "success")
            return redirect(url_for("records"))

        except Exception as exc:
            flash(f"Could not update {kind}: {exc}", "error")

    if kind == "products":
        content = """
        <form method="post" enctype="multipart/form-data">
          <label>
            ID
            <input
                value="{{ '%03d'|format(row.id|int) }}"
                disabled
            >
          </label>

          <label>
            Generated folder
            <input
                value="{{ '%03d'|format(row.id|int) }}_{{ row.code }}"
                disabled
            >
          </label>

          <label>
            Product code
            <input name="code" value="{{ row.code }}" required>
          </label>

          <label>
            Product name
            <input name="name" value="{{ row.name }}" required>
          </label>

          <label>
            Replace image
            <input
                type="file"
                name="image"
                accept=".jpg,.jpeg,.png,.webp,.gif"
            >
            <small>Saved as [product name].jpg</small>
          </label>

          <label>
            Replace video
            <input
                type="file"
                name="video"
                accept=".mp4,.webm,.mov,.m4v"
            >
            <small>Saved as [product name].mp4</small>
          </label>

          <label>
            Description
            <textarea name="description" rows="4">{{ row.description }}</textarea>
          </label>

          <button type="submit">Update product</button>
        </form>
        """

    elif kind == "categories":
        content = """
        <form method="post">
          <label>
            ID
            <input value="{{ row.id }}" disabled>
          </label>

          <label>
            Name
            <input name="name" value="{{ row.name }}" required>
          </label>

          <label>
            Slug
            <input name="slug" value="{{ row.slug }}">
          </label>

          <label>
            Sort order
            <input
                name="sort_order"
                type="number"
                value="{{ row.sort_order }}"
            >
          </label>

          <button type="submit">Update category</button>
        </form>
        """

    else:
        content = """
        <form method="post" enctype="multipart/form-data">
          <label>
            ID
            <input value="{{ row.id }}" disabled>
          </label>

          <label>
            Name
            <input name="name" value="{{ row.name }}" required>
          </label>

          <label>
            Code
            <input name="code" placeholder="e.g. SC01">
          </label>

          <label>
            Slug
            <input name="slug" value="{{ row.slug }}">
          </label>

          <label>
            Sort order
            <input
                name="sort_order"
                type="number"
                value="{{ row.sort_order }}"
            >
          </label>

          <label>
            Replace cover image
            <input
                type="file"
                name="image"
                accept=".jpg,.jpeg,.png,.webp,.gif"
            >
          </label>

          <label>
            Description
            <textarea name="description" rows="4">{{ row.description }}</textarea>
          </label>

          <button type="submit">Update collection</button>
        </form>
        """

    return render_page(
        f"Edit {kind}",
        content,
        row=row,
    )


if __name__ == "__main__":
    initialize()
    app.run(debug=True)
