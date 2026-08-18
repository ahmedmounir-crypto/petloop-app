document.addEventListener("DOMContentLoaded", async function () {
  var root = document.getElementById("product-root");
  if (!root) return; // not on the product page

  var db = window.petloop.db;
  var notFound = document.getElementById("product-not-found");
  var params = new URLSearchParams(window.location.search);
  var productId = params.get("id");

  var CATEGORY_ICON = {
    Food: "assets/icons/bone-ink.svg",
    Accessories: "assets/icons/bag-ink.svg"
  };

  function money(n) {
    return "EGP " + Number(n).toLocaleString();
  }

  if (!productId) {
    notFound.style.display = "block";
    return;
  }

  var res = await db.from("products").select("*").eq("id", productId).single();
  if (res.error || !res.data) {
    notFound.style.display = "block";
    return;
  }

  var product = res.data;
  document.title = product.name + " | PetLoop";

  var icon = CATEGORY_ICON[product.category] || "assets/icons/paw-ink.svg";
  var galleryMain = document.getElementById("product-gallery-main");
  galleryMain.innerHTML = product.image_url
    ? '<img src="' + product.image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
    : '<span class="icon "><img src="' + icon + '" alt=""></span>';

  document.getElementById("product-breadcrumb-cat").textContent = product.category || "Product";
  document.getElementById("product-cat-badge").textContent = product.category || "Pet Supplies";
  document.getElementById("product-title").textContent = product.name;
  document.getElementById("product-price").textContent = money(product.price);
  document.getElementById("product-description").textContent = product.description || "";
  document.getElementById("product-spec-category").textContent = product.category || "—";
  document.getElementById("product-spec-stock").textContent = product.stock > 0 ? product.stock + " units available" : "Out of stock";

  var inStockBadge = document.getElementById("product-in-stock");
  var outStockBadge = document.getElementById("product-out-stock");
  var addBtn = document.getElementById("product-add-to-cart");
  var outOfStock = product.stock <= 0;
  if (outOfStock) {
    inStockBadge.style.display = "none";
    outStockBadge.style.display = "block";
    addBtn.disabled = true;
  } else {
    inStockBadge.style.display = "block";
    outStockBadge.style.display = "none";
  }

  // ---- qty stepper ----
  var qtyValue = document.getElementById("product-qty-value");
  var qty = 1;
  document.getElementById("product-qty-minus").addEventListener("click", function () {
    if (qty > 1) { qty--; qtyValue.textContent = qty; }
  });
  document.getElementById("product-qty-plus").addEventListener("click", function () {
    if (qty < (product.stock || 99)) { qty++; qtyValue.textContent = qty; }
  });

  // ---- add to cart ----
  var statusBox = document.getElementById("product-add-status");
  function showStatus(msg, kind) {
    statusBox.style.display = "block";
    statusBox.textContent = msg;
    statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
    statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
  }
  addBtn.addEventListener("click", async function () {
    var user = await window.petloop.getSessionUser();
    if (!user) {
      window.location.href = "account.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
      return;
    }
    addBtn.disabled = true;
    var existing = await db.from("cart_items").select("id, quantity").eq("profile_id", user.id).eq("product_id", product.id).maybeSingle();
    if (existing.data) {
      await db.from("cart_items").update({ quantity: existing.data.quantity + qty }).eq("id", existing.data.id);
    } else {
      await db.from("cart_items").insert({ profile_id: user.id, product_id: product.id, quantity: qty });
    }
    addBtn.disabled = false;
    showStatus("Added to cart!", "ok");
    await window.petloop.refreshCartBadge();
  });

  root.style.display = "block";

  // ---- related products (same category) ----
  var relRes = await db.from("products").select("*").eq("category", product.category).neq("id", product.id).limit(4);
  var related = relRes.data || [];
  if (related.length) {
    var grid = document.getElementById("related-products-grid");
    grid.innerHTML = related.map(function (p) {
      var media = p.image_url
        ? '<img src="' + p.image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
        : '<span class="icon "><img src="' + (CATEGORY_ICON[p.category] || "assets/icons/paw-ink.svg") + '" alt=""></span>';
      return '' +
        '<a class="product-card" href="product.html?id=' + p.id + '" style="display:block;color:inherit;text-decoration:none;">' +
        '<div class="product-media">' + media + '</div>' +
        '<div class="product-body"><span class="cat">' + window.petloop.escapeHtml(p.category || "Pet Supplies") + '</span>' +
        '<h4>' + window.petloop.escapeHtml(p.name) + '</h4>' +
        '<div class="price-row"><span class="price">' + money(p.price) + '</span></div></div>' +
        '</a>';
    }).join("");
    document.getElementById("related-products-section").style.display = "block";
  }
});
