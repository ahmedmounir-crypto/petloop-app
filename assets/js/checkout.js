document.addEventListener("DOMContentLoaded", async function () {
  var root = document.getElementById("checkout-root");
  if (!root) return; // not on the checkout page

  var db = window.petloop.db;
  var money = window.petloop.money;
  var signedOut = document.getElementById("checkout-signed-out");
  var emptyCart = document.getElementById("checkout-empty-cart");
  var successSection = document.getElementById("checkout-success");

  var user = await window.petloop.getSessionUser();
  if (!user) {
    signedOut.style.display = "block";
    return;
  }

  var cartRes = await db.from("cart_items")
    .select("id, quantity, products(id, name, price, image_url, category)")
    .eq("profile_id", user.id);
  var items = cartRes.data || [];

  if (items.length === 0) {
    emptyCart.style.display = "block";
    return;
  }

  var subtotal = items.reduce(function (s, i) { return s + (i.products ? i.products.price * i.quantity : 0); }, 0);
  var total = subtotal + window.petloop.DELIVERY_FEE;
  document.getElementById("checkout-subtotal").textContent = money(subtotal);
  document.getElementById("checkout-delivery").textContent = money(window.petloop.DELIVERY_FEE);
  document.getElementById("checkout-total").textContent = money(total);

  document.getElementById("checkout-items-preview").innerHTML = '<div class="card">' +
    '<h3 class="mt-0">Items (' + items.length + ')</h3>' +
    items.map(function (i) {
      var p = i.products || {};
      return '<div class="cart-row"><div class="grow"><h4 style="margin:0;">' + window.petloop.escapeHtml(p.name || "Product") + '</h4>' +
        '<span style="font-size:13px;color:var(--grey-light);">Qty ' + i.quantity + '</span></div>' +
        '<div class="price">' + money((p.price || 0) * i.quantity) + '</div></div>';
    }).join("") +
    '</div>';

  // Prefill from profile, if available.
  var profRes = await db.from("profiles").select("full_name, phone, city").eq("id", user.id).maybeSingle();
  var profile = profRes.data;
  if (profile) {
    if (profile.full_name) document.getElementById("checkout-name").value = profile.full_name;
    if (profile.phone) document.getElementById("checkout-phone").value = profile.phone;
    if (profile.city) document.getElementById("checkout-city").value = profile.city;
  }

  root.style.display = "block";

  var statusBox = document.getElementById("checkout-status");
  function showStatus(msg, kind) {
    statusBox.style.display = "block";
    statusBox.textContent = msg;
    statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
    statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
  }

  document.getElementById("checkout-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var name = document.getElementById("checkout-name").value.trim();
    var phone = document.getElementById("checkout-phone").value.trim();
    var address = document.getElementById("checkout-address").value.trim();
    var city = document.getElementById("checkout-city").value.trim();
    var governorate = document.getElementById("checkout-governorate").value.trim();
    if (!name || !phone || !address || !city) {
      showStatus("Please fill in name, phone, address and city.", "error");
      return;
    }

    var submitBtn = document.getElementById("checkout-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Placing order...";

    var fullAddress = name + ", " + phone + " — " + address + ", " + city + (governorate ? ", " + governorate : "");
    var paymentMethod = document.getElementById("checkout-payment-method").value;

    var orderRes = await db.from("orders").insert({
      profile_id: user.id,
      status: "pending",
      payment_method: paymentMethod,
      delivery_address: fullAddress,
      total: total
    }).select().single();

    if (orderRes.error) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Place Order";
      showStatus("Couldn't place your order: " + orderRes.error.message, "error");
      return;
    }

    var order = orderRes.data;
    var orderItemsPayload = items.map(function (i) {
      return { order_id: order.id, product_id: i.products ? i.products.id : null, quantity: i.quantity, unit_price: i.products ? i.products.price : 0 };
    });
    var itemsRes = await db.from("order_items").insert(orderItemsPayload);
    if (itemsRes.error) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Place Order";
      showStatus("Order created but items failed to save: " + itemsRes.error.message, "error");
      return;
    }

    await db.from("cart_items").delete().eq("profile_id", user.id);
    await window.petloop.refreshCartBadge();

    root.style.display = "none";
    document.getElementById("checkout-success-msg").textContent = "Order total " + money(total) + " — cash on delivery to " + address + ", " + city + ".";
    successSection.style.display = "block";
  });
});
