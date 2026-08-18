document.addEventListener("DOMContentLoaded", async function () {
  var root = document.getElementById("listing-root");
  if (!root) return; // not on the listing-detail page

  var db = window.petloop.db;
  var money = window.petloop.money;
  var notFound = document.getElementById("listing-not-found");
  var params = new URLSearchParams(window.location.search);
  var listingId = params.get("id");

  if (!listingId) {
    notFound.style.display = "block";
    return;
  }

  var res = await db.from("marketplace_listings")
    .select("*, profiles!marketplace_listings_seller_id_fkey(id, full_name, city)")
    .eq("id", listingId)
    .single();

  if (res.error || !res.data) {
    notFound.style.display = "block";
    return;
  }

  var listing = res.data;
  var seller = listing.profiles || {};
  document.title = listing.title + " | PetLoop Marketplace";

  var images = Array.isArray(listing.images) ? listing.images : [];
  document.getElementById("listing-gallery-main").innerHTML = images.length
    ? '<img src="' + images[0] + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
    : '<span class="icon "><img src="' + window.petloop.speciesIcon(listing.category) + '" alt=""></span>';

  document.getElementById("listing-breadcrumb-title").textContent = listing.title;
  document.getElementById("listing-category-badge").textContent = listing.category || "Pet";
  document.getElementById("listing-title").textContent = listing.title;
  document.getElementById("listing-meta").innerHTML = (seller.city ? '<span class="icon "><img src="assets/icons/map-pin-grey.svg" alt=""></span> ' + window.petloop.escapeHtml(seller.city) + " &middot; " : "") + "Listed by " + window.petloop.escapeHtml(seller.full_name || "PetLoop Member");
  document.getElementById("listing-price").textContent = money(listing.price || 0);
  document.getElementById("listing-description").textContent = listing.description || "";

  var contactBtn = document.getElementById("listing-contact-seller-btn");
  var ownNote = document.getElementById("listing-own-note");
  var sessionUser = await window.petloop.getSessionUser();
  var isOwn = sessionUser && seller.id === sessionUser.id;

  if (isOwn) {
    contactBtn.style.display = "none";
    ownNote.style.display = "block";
  } else {
    contactBtn.href = sessionUser
      ? "chat.html?with=" + encodeURIComponent(seller.id)
      : "account.html?next=" + encodeURIComponent("chat.html?with=" + seller.id);
  }

  root.style.display = "block";

  // ---- similar listings (same category) ----
  var simRes = await db.from("marketplace_listings")
    .select("*")
    .eq("category", listing.category)
    .eq("status", "active")
    .neq("id", listing.id)
    .limit(4);
  var similar = simRes.data || [];
  if (similar.length) {
    document.getElementById("listing-similar-grid").innerHTML = similar.map(function (l) {
      var imgs = Array.isArray(l.images) ? l.images : [];
      var media = imgs.length
        ? '<img src="' + imgs[0] + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
        : '<span class="icon "><img src="' + window.petloop.speciesIcon(l.category) + '" alt=""></span>';
      return '<div class="listing-card"><div class="listing-media">' + media + '</div><div class="listing-body">' +
        '<h4>' + window.petloop.escapeHtml(l.title) + '</h4>' +
        '<div class="price-row"><span class="listing-price">' + money(l.price || 0) + '</span><a href="listing-detail.html?id=' + l.id + '" class="btn btn-outline-ink btn-sm">View</a></div>' +
        '</div></div>';
    }).join("");
    document.getElementById("listing-similar-section").style.display = "block";
  }
});
