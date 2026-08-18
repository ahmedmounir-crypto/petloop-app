document.addEventListener("DOMContentLoaded", async function () {
  var grid = document.getElementById("product-grid");
  if (!grid) return; // not on the shop page

  var db = window.petloop.db;
  var emptyMsg = document.getElementById("product-grid-empty");
  var countLabel = document.getElementById("product-count-label");
  var sortSelect = document.getElementById("product-sort");
  var tabs = document.querySelectorAll("#category-tabs .tab");

  var CATEGORY_ICON = {
    Food: "assets/icons/bone-ink.svg",
    Accessories: "assets/icons/bag-ink.svg"
  };

  var allProducts = [];
  var activeCategory = "all";

  function money(n) {
    return "EGP " + Number(n).toLocaleString();
  }

  function render() {
    var list = allProducts.filter(function (p) {
      return activeCategory === "all" || p.category === activeCategory;
    });

    var sort = sortSelect.value;
    list = list.slice();
    if (sort === "price-asc") list.sort(function (a, b) { return a.price - b.price; });
    if (sort === "price-desc") list.sort(function (a, b) { return b.price - a.price; });

    countLabel.textContent = list.length + " product" + (list.length === 1 ? "" : "s");
    grid.innerHTML = "";
    emptyMsg.style.display = list.length ? "none" : "block";

    list.forEach(function (p) {
      var media = p.image_url
        ? '<img src="' + p.image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
        : '<span class="icon "><img src="' + (CATEGORY_ICON[p.category] || "assets/icons/paw-ink.svg") + '" alt=""></span>';
      var outOfStock = p.stock <= 0;

      var card = document.createElement("a");
      card.className = "product-card";
      card.href = "product.html?id=" + p.id;
      card.style.display = "block";
      card.style.color = "inherit";
      card.style.textDecoration = "none";
      card.innerHTML =
        '<div class="product-media">' + media +
        (outOfStock ? '<span class="badge-pill badge-grey flag">Out of Stock</span>' : '') +
        '</div>' +
        '<div class="product-body">' +
        '<span class="cat">' + window.petloop.escapeHtml(p.category || "Pet Supplies") + '</span>' +
        '<h4>' + window.petloop.escapeHtml(p.name) + '</h4>' +
        '<div class="price-row"><span class="price">' + money(p.price) + '</span>' +
        '<button type="button" class="add-btn" ' + (outOfStock ? "disabled" : "") + '><span class="icon "><img src="assets/icons/plus-white.svg" alt=""></span></button>' +
        '</div></div>';

      var addBtn = card.querySelector(".add-btn");
      if (!outOfStock) {
        addBtn.addEventListener("click", async function (e) {
          e.preventDefault();
          e.stopPropagation();
          var user = await window.petloop.getSessionUser();
          if (!user) {
            window.location.href = "account.html?next=shop.html";
            return;
          }
          addBtn.disabled = true;
          var existing = await db.from("cart_items").select("id, quantity").eq("profile_id", user.id).eq("product_id", p.id).maybeSingle();
          if (existing.data) {
            await db.from("cart_items").update({ quantity: existing.data.quantity + 1 }).eq("id", existing.data.id);
          } else {
            await db.from("cart_items").insert({ profile_id: user.id, product_id: p.id, quantity: 1 });
          }
          await window.petloop.refreshCartBadge();
          addBtn.innerHTML = '<span class="icon "><img src="assets/icons/check-white.svg" alt=""></span>';
          setTimeout(function () {
            addBtn.innerHTML = '<span class="icon "><img src="assets/icons/plus-white.svg" alt=""></span>';
            addBtn.disabled = false;
          }, 1200);
        });
      }

      grid.appendChild(card);
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function (e) {
      e.preventDefault();
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      activeCategory = tab.getAttribute("data-category");
      render();
    });
  });
  sortSelect.addEventListener("change", render);

  var res = await db.from("products").select("*").order("created_at", { ascending: false });
  allProducts = res.data || [];
  render();
});
