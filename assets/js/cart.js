document.addEventListener("DOMContentLoaded", async function () {
  var root = document.getElementById("cart-root");
  if (!root) return; // not on the cart page

  var db = window.petloop.db;
  var signedOut = document.getElementById("cart-signed-out");
  var lede = document.getElementById("cart-item-count-lede");
  var money = window.petloop.money;

  var CATEGORY_ICON = {
    Food: "assets/icons/bone-grey.svg",
    Accessories: "assets/icons/bag-grey.svg"
  };

  var user = await window.petloop.getSessionUser();
  if (!user) {
    lede.textContent = "Log in to see your cart.";
    signedOut.style.display = "block";
    return;
  }

  var listEl = document.getElementById("cart-items-list");
  var emptyMsg = document.getElementById("cart-empty-msg");
  var subtotalEl = document.getElementById("cart-subtotal");
  var deliveryEl = document.getElementById("cart-delivery");
  var totalEl = document.getElementById("cart-total");
  var checkoutBtn = document.getElementById("cart-checkout-btn");

  deliveryEl.textContent = money(window.petloop.DELIVERY_FEE);

  async function load() {
    var res = await db.from("cart_items")
      .select("id, quantity, products(id, name, category, price, image_url, stock)")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true });
    var items = res.data || [];

    var itemCount = items.reduce(function (s, i) { return s + i.quantity; }, 0);
    lede.textContent = itemCount === 0 ? "Your cart is empty." : itemCount + " item" + (itemCount === 1 ? "" : "s") + " ready for checkout.";

    if (items.length === 0) {
      listEl.innerHTML = "";
      emptyMsg.style.display = "block";
      checkoutBtn.classList.add("disabled");
      checkoutBtn.style.pointerEvents = "none";
      checkoutBtn.style.opacity = "0.5";
    } else {
      emptyMsg.style.display = "none";
      checkoutBtn.style.pointerEvents = "";
      checkoutBtn.style.opacity = "";
      listEl.innerHTML = items.map(function (item) {
        var p = item.products || {};
        var icon = CATEGORY_ICON[p.category] || "assets/icons/paw-grey.svg";
        var thumb = p.image_url
          ? '<img src="' + p.image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
          : '<span class="icon "><img src="' + icon + '" alt=""></span>';
        return '' +
          '<div class="cart-row" data-item-id="' + item.id + '">' +
          '<div class="cart-thumb">' + thumb + '</div>' +
          '<div class="grow">' +
          '<span class="cat" style="font-size:11px;font-weight:700;color:var(--coral-deep);text-transform:uppercase;">' + window.petloop.escapeHtml(p.category || "") + '</span>' +
          '<h4><a href="product.html?id=' + p.id + '" style="color:inherit;">' + window.petloop.escapeHtml(p.name || "Product") + '</a></h4>' +
          '<div class="qty-stepper" style="display:inline-flex;"><button type="button" class="cart-qty-minus">&minus;</button><span class="cart-qty-value">' + item.quantity + '</span><button type="button" class="cart-qty-plus">+</button></div>' +
          '</div>' +
          '<div style="text-align:right;">' +
          '<div class="price">' + money(p.price * item.quantity) + '</div>' +
          '<a href="#" class="cart-remove-link" style="font-size:12.5px;color:var(--grey-light);">Remove</a>' +
          '</div>' +
          '</div>';
      }).join("");
    }

    var subtotal = items.reduce(function (s, i) { return s + (i.products ? i.products.price * i.quantity : 0); }, 0);
    var total = items.length ? subtotal + window.petloop.DELIVERY_FEE : 0;
    subtotalEl.textContent = money(subtotal);
    totalEl.textContent = money(total);
  }

  listEl.addEventListener("click", async function (e) {
    var row = e.target.closest(".cart-row");
    if (!row) return;
    var itemId = row.getAttribute("data-item-id");

    if (e.target.closest(".cart-remove-link")) {
      e.preventDefault();
      await db.from("cart_items").delete().eq("id", itemId);
      await window.petloop.refreshCartBadge();
      await load();
      return;
    }
    if (e.target.closest(".cart-qty-minus") || e.target.closest(".cart-qty-plus")) {
      var isPlus = !!e.target.closest(".cart-qty-plus");
      var valueSpan = row.querySelector(".cart-qty-value");
      var current = parseInt(valueSpan.textContent, 10) || 1;
      var next = isPlus ? current + 1 : current - 1;
      if (next < 1) {
        await db.from("cart_items").delete().eq("id", itemId);
      } else {
        await db.from("cart_items").update({ quantity: next }).eq("id", itemId);
      }
      await window.petloop.refreshCartBadge();
      await load();
      return;
    }
  });

  root.style.display = "block";
  await load();
});
