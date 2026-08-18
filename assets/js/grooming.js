document.addEventListener("DOMContentLoaded", async function () {
  var grid = document.getElementById("grooming-grid");
  if (!grid) return; // not on the grooming page

  var db = window.petloop.db;
  var emptyMsg = document.getElementById("grooming-empty");
  var countLabel = document.getElementById("grooming-count-label");
  var sortSelect = document.getElementById("grooming-sort");
  var filtersEl = document.getElementById("grooming-city-filters");

  var allGroomers = [];
  var activeCities = null; // null = all

  function stars(rating) {
    var full = Math.round(rating || 0);
    var html = "";
    for (var i = 0; i < 5; i++) {
      html += '<span class="icon "><img src="assets/icons/star-' + (i < full ? "gold" : "grey") + '.svg" alt=""></span>';
    }
    return html;
  }

  function render() {
    var list = allGroomers.filter(function (g) {
      return !activeCities || activeCities.indexOf(g.city) !== -1;
    });

    var sort = sortSelect.value;
    list = list.slice();
    if (sort === "rating") list.sort(function (a, b) { return (b.rating || 0) - (a.rating || 0); });

    countLabel.textContent = list.length + " groomer" + (list.length === 1 ? "" : "s") + " near Cairo";
    emptyMsg.style.display = list.length ? "none" : "block";

    grid.innerHTML = list.map(function (g) {
      var media = g.avatar_url
        ? '<img src="' + g.avatar_url + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
        : '<span class="icon "><img src="assets/icons/scissors-ink.svg" alt=""></span>';
      return '' +
        '<div class="groomer-card">' +
        '<div class="groomer-media">' + media + (g.verified ? '<span class="badge-pill badge-gold" style="position:absolute;top:10px;left:10px;"><span class="icon "><img src="assets/icons/certificate-gold.svg" alt=""></span> Verified</span>' : '') + '</div>' +
        '<div class="groomer-body">' +
        '<h4 style="margin:0 0 4px;font-size:16px;">' + window.petloop.escapeHtml(g.business_name) + '</h4>' +
        '<div style="font-size:13px;color:var(--grey-light);margin-bottom:8px;"><span class="icon "><img src="assets/icons/map-pin-grey.svg" alt=""></span> ' + window.petloop.escapeHtml(g.city || "") + '</div>' +
        '<div class="stars">' + stars(g.rating) + ' <span>' + (g.rating || 0).toFixed(1) + ' (' + (g.review_count || 0) + ')</span></div>' +
        '<div class="price-row" style="margin-top:12px;"><span class="price" style="font-size:16px;">' + window.petloop.escapeHtml(g.price_range || "") + '</span><a href="groomer-profile.html?id=' + g.id + '" class="btn btn-coral btn-sm">Book</a></div>' +
        '</div></div>';
    }).join("");
  }

  function buildFilters() {
    var cities = Array.from(new Set(allGroomers.map(function (g) { return g.city; }).filter(Boolean))).sort();
    if (cities.length === 0) {
      filtersEl.innerHTML = '<p class="form-hint">No groomers listed yet.</p>';
      return;
    }
    filtersEl.innerHTML = cities.map(function (c) {
      return '<label class="filter-row"><input type="checkbox" checked data-city="' + window.petloop.escapeHtml(c) + '"> ' + window.petloop.escapeHtml(c) + '</label>';
    }).join("");
    filtersEl.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var checked = Array.from(filtersEl.querySelectorAll("input[type=checkbox]:checked")).map(function (c) { return c.getAttribute("data-city"); });
        activeCities = checked.length === cities.length ? null : checked;
        render();
      });
    });
  }

  sortSelect.addEventListener("change", render);

  var res = await db.from("groomers").select("*").order("rating", { ascending: false });
  allGroomers = res.data || [];
  buildFilters();
  render();
});
