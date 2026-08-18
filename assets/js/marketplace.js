document.addEventListener("DOMContentLoaded", async function () {
  var grid = document.getElementById("marketplace-grid");
  if (!grid) return; // not on the marketplace page

  var db = window.petloop.db;
  var money = window.petloop.money;
  var emptyMsg = document.getElementById("marketplace-empty");
  var countLabel = document.getElementById("marketplace-count-label");
  var sortSelect = document.getElementById("marketplace-sort");
  var filtersEl = document.getElementById("marketplace-category-filters");

  var allListings = [];
  var activeCategories = null; // null = all

  function render() {
    var list = allListings.filter(function (l) {
      return !activeCategories || activeCategories.indexOf(l.category) !== -1;
    });

    var sort = sortSelect.value;
    list = list.slice();
    if (sort === "price-asc") list.sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
    else if (sort === "price-desc") list.sort(function (a, b) { return (b.price || 0) - (a.price || 0); });
    else list.sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });

    countLabel.textContent = list.length + " listing" + (list.length === 1 ? "" : "s");
    emptyMsg.style.display = list.length ? "none" : "block";

    grid.innerHTML = list.map(function (l) {
      var seller = l.profiles || {};
      var images = Array.isArray(l.images) ? l.images : [];
      var media = images.length
        ? '<img src="' + images[0] + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
        : '<span class="icon "><img src="' + window.petloop.speciesIcon(l.category) + '" alt=""></span>';
      return '' +
        '<div class="listing-card">' +
        '<div class="listing-media">' + media + '</div>' +
        '<div class="listing-body">' +
        '<h4>' + window.petloop.escapeHtml(l.title) + '</h4>' +
        '<div style="font-size:12.5px;color:var(--grey-light);margin-bottom:8px;">' + window.petloop.escapeHtml(l.category || "Pet") + (seller.city ? ' &middot; <span class="icon "><img src="assets/icons/map-pin-grey.svg" alt=""></span> ' + window.petloop.escapeHtml(seller.city) : '') + '</div>' +
        '<div class="price-row"><span class="listing-price">' + money(l.price || 0) + '</span><a href="listing-detail.html?id=' + l.id + '" class="btn btn-outline-ink btn-sm">View</a></div>' +
        '</div></div>';
    }).join("");
  }

  function buildFilters() {
    var categories = Array.from(new Set(allListings.map(function (l) { return l.category; }).filter(Boolean))).sort();
    if (categories.length === 0) {
      filtersEl.innerHTML = '<p class="form-hint">No listings yet.</p>';
      return;
    }
    filtersEl.innerHTML = categories.map(function (c) {
      return '<label class="filter-row"><input type="checkbox" checked data-category="' + window.petloop.escapeHtml(c) + '"> ' + window.petloop.escapeHtml(c) + '</label>';
    }).join("");
    filtersEl.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var checked = Array.from(filtersEl.querySelectorAll("input[type=checkbox]:checked")).map(function (c) { return c.getAttribute("data-category"); });
        activeCategories = checked.length === categories.length ? null : checked;
        render();
      });
    });
  }

  sortSelect.addEventListener("change", render);

  var res = await db.from("marketplace_listings")
    .select("*, profiles!marketplace_listings_seller_id_fkey(full_name, city)")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  allListings = res.data || [];
  buildFilters();
  render();
});
