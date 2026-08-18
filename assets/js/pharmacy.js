document.addEventListener("DOMContentLoaded", async function () {
  var grid = document.getElementById("pharmacy-product-grid");
  if (!grid) return; // not on the pharmacy page

  var db = window.petloop.db;
  var money = window.petloop.money;
  var emptyMsg = document.getElementById("pharmacy-empty");
  var tabs = document.querySelectorAll("#pharmacy-tabs .tab");

  // Simple device-local pharmacy cart: { productId: quantity }
  var CART_KEY = "petloop_pharmacy_cart";
  function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch (e) { return {}; }
  }
  function setCart(cart) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* ignore */ }
  }

  var allProducts = [];
  var activeFilter = "all";

  function render() {
    var list = allProducts.filter(function (p) {
      if (activeFilter === "rx") return p.requires_prescription;
      if (activeFilter === "otc") return !p.requires_prescription;
      return true;
    });

    grid.innerHTML = "";
    emptyMsg.style.display = list.length ? "none" : "block";

    list.forEach(function (p) {
      var outOfStock = p.stock <= 0;
      var media = p.image_url
        ? '<img src="' + p.image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
        : '<span class="icon "><img src="assets/icons/pills-ink.svg" alt=""></span>';
      var flag = p.requires_prescription
        ? '<span class="badge-pill badge-coral flag"><span class="icon "><img src="assets/icons/kit-medical-white.svg" alt=""></span> Rx Required</span>'
        : '<span class="badge-pill badge-green flag">OTC</span>';
      var descParts = (p.description || "").split(" · ");
      var cat = descParts.length > 1 ? descParts[0] : "Pharmacy";

      var card = document.createElement("div");
      card.className = "product-card";
      card.innerHTML =
        '<div class="product-media">' + media + flag + '</div>' +
        '<div class="product-body">' +
        '<span class="cat">' + window.petloop.escapeHtml(cat) + '</span>' +
        '<h4>' + window.petloop.escapeHtml(p.name) + '</h4>' +
        '<p style="font-size:13px;color:var(--grey-light);margin:4px 0 8px;">' + window.petloop.escapeHtml(descParts.length > 1 ? descParts[1] : (p.description || "")) + '</p>' +
        '<div class="price-row"><span class="price">' + money(p.price) + '</span>' +
        '<button type="button" class="add-btn" ' + (outOfStock ? "disabled" : "") + '><span class="icon "><img src="assets/icons/plus-white.svg" alt=""></span></button>' +
        '</div></div>';

      if (!outOfStock) {
        card.querySelector(".add-btn").addEventListener("click", function () {
          var cart = getCart();
          cart[p.id] = (cart[p.id] || 0) + 1;
          setCart(cart);
          renderCartPanel();
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
      activeFilter = tab.getAttribute("data-filter");
      render();
    });
  });

  // ---- order side panel ----
  var cartListEl = document.getElementById("pharmacy-cart-list");
  var totalRow = document.getElementById("pharmacy-cart-total-row");
  var totalEl = document.getElementById("pharmacy-cart-total");
  var notesField = document.getElementById("pharmacy-notes-field");
  var submitBtn = document.getElementById("pharmacy-submit-order");
  var statusBox = document.getElementById("pharmacy-order-status");

  function showStatus(msg, kind) {
    statusBox.style.display = "block";
    statusBox.textContent = msg;
    statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
    statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
  }

  function renderCartPanel() {
    var cart = getCart();
    var ids = Object.keys(cart).filter(function (id) { return cart[id] > 0; });
    if (ids.length === 0) {
      cartListEl.innerHTML = '<p class="form-hint">No items added yet.</p>';
      totalRow.style.display = "none";
      notesField.style.display = "none";
      submitBtn.style.display = "none";
      return;
    }
    var total = 0;
    var hasRx = false;
    cartListEl.innerHTML = ids.map(function (id) {
      var p = allProducts.find(function (x) { return x.id === id; });
      if (!p) return "";
      var qty = cart[id];
      total += p.price * qty;
      if (p.requires_prescription) hasRx = true;
      return '<div class="cart-row" data-product-id="' + id + '">' +
        '<div class="grow"><h4 style="margin:0;font-size:14px;">' + window.petloop.escapeHtml(p.name) + '</h4>' +
        '<div class="qty-stepper" style="display:inline-flex;margin-top:6px;"><button type="button" class="pharm-qty-minus">&minus;</button><span>' + qty + '</span><button type="button" class="pharm-qty-plus">+</button></div></div>' +
        '<div style="text-align:right;"><div class="price">' + money(p.price * qty) + '</div>' +
        '<a href="#" class="pharm-remove" style="font-size:12.5px;color:var(--grey-light);">Remove</a></div>' +
        '</div>';
    }).join("");
    totalEl.textContent = money(total);
    totalRow.style.display = "flex";
    notesField.style.display = hasRx ? "block" : "none";
    submitBtn.style.display = "block";
  }

  cartListEl.addEventListener("click", function (e) {
    var row = e.target.closest(".cart-row");
    if (!row) return;
    var productId = row.getAttribute("data-product-id");
    var cart = getCart();
    if (e.target.closest(".pharm-remove")) {
      e.preventDefault();
      delete cart[productId];
    } else if (e.target.closest(".pharm-qty-plus")) {
      cart[productId] = (cart[productId] || 0) + 1;
    } else if (e.target.closest(".pharm-qty-minus")) {
      cart[productId] = (cart[productId] || 0) - 1;
      if (cart[productId] <= 0) delete cart[productId];
    } else {
      return;
    }
    setCart(cart);
    renderCartPanel();
  });

  submitBtn.addEventListener("click", async function () {
    var user = await window.petloop.getSessionUser();
    if (!user) {
      window.location.href = "account.html?next=pharmacy.html";
      return;
    }
    var cart = getCart();
    var ids = Object.keys(cart).filter(function (id) { return cart[id] > 0; });
    if (ids.length === 0) return;

    var total = 0;
    var lines = ids.map(function (id) {
      var p = allProducts.find(function (x) { return x.id === id; });
      var qty = cart[id];
      total += p.price * qty;
      return { product_id: id, quantity: qty, unit_price: p.price };
    });

    var notes = document.getElementById("pharmacy-notes").value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    var orderRes = await db.from("pharmacy_orders").insert({
      profile_id: user.id,
      status: "pending_review",
      total: total,
      notes: notes || null
    }).select().single();

    if (orderRes.error) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Order for Review";
      showStatus("Couldn't submit order: " + orderRes.error.message, "error");
      return;
    }

    var order = orderRes.data;
    var itemsPayload = lines.map(function (l) {
      return { order_id: order.id, product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price };
    });
    var itemsRes = await db.from("pharmacy_order_items").insert(itemsPayload);

    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Order for Review";

    if (itemsRes.error) {
      showStatus("Order created but items failed to save: " + itemsRes.error.message, "error");
      return;
    }

    setCart({});
    renderCartPanel();
    showStatus("Order submitted! Our licensed pharmacist will review it" + (notes ? " along with your notes" : "") + " before dispatch.", "ok");
  });

  var res = await db.from("pharmacy_products").select("*").order("requires_prescription", { ascending: true });
  allProducts = res.data || [];
  render();
  renderCartPanel();
});
