document.addEventListener("DOMContentLoaded", async function () {
  var mapEl = document.getElementById("walks-map");
  if (!mapEl || typeof L === "undefined") return; // not on the walks page / Leaflet failed to load

  var db = window.petloop.db;
  var CAIRO = { lat: 30.0444, lng: 31.2357 };

  var listEl = document.getElementById("walk-list");
  var emptyEl = document.getElementById("walk-list-empty");
  var radiusSelect = document.getElementById("walk-radius");
  var walksHeading = document.getElementById("walks-heading");
  var petSelect = document.getElementById("walk-pet-select");
  var statusBox = document.getElementById("post-walk-status");
  var geoHint = document.getElementById("geo-hint");

  function showStatus(el, message, kind) {
    el.style.display = "block";
    el.textContent = message;
    el.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
    el.style.color = kind === "error" ? "#B23B2E" : "#21403A";
  }

  // ---- map setup ----
  var map = L.map(mapEl).setView([CAIRO.lat, CAIRO.lng], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  var meMarker = null;
  var pinMarkers = [];

  var user = await window.petloop.getSessionUser();

  // ---- populate "post a walk" pet select ----
  var myPets = [];
  if (user) {
    myPets = await window.petloop.getMyPets(user.id);
    if (myPets.length) {
      petSelect.innerHTML = myPets.map(function (p) {
        return '<option value="' + p.id + '">' + window.petloop.escapeHtml(p.name) + ' (' + window.petloop.escapeHtml(p.breed || p.species) + ')</option>';
      }).join("");
    } else {
      petSelect.innerHTML = '<option value="">Add a pet first</option>';
    }
  } else {
    petSelect.innerHTML = '<option value="">Sign in to post a walk</option>';
  }

  // ---- figure out where "you" are ----
  var myLoc = await window.petloop.getBrowserLocation();
  if (myLoc) {
    map.setView([myLoc.lat, myLoc.lng], 13);
    meMarker = L.circleMarker([myLoc.lat, myLoc.lng], { radius: 8, color: "#FF7A59", fillColor: "#FF7A59", fillOpacity: 0.9 })
      .addTo(map).bindPopup("You are here");
    geoHint.textContent = "Showing walks near your current location.";
  } else {
    geoHint.textContent = "Turn on location access in your browser to see walks and distances near you — showing Cairo for now.";
  }

  var refLoc = myLoc || CAIRO;

  function timeLabel(iso) {
    if (!iso) return "Time TBD";
    var d = new Date(iso);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    var isTomorrow = d.toDateString() === tomorrow.toDateString();
    var time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (sameDay) return "Today, " + time;
    if (isTomorrow) return "Tomorrow, " + time;
    return d.toLocaleDateString([], { weekday: "long" }) + ", " + time;
  }

  var allWalks = [];

  async function load() {
    var res = await db.from("walk_requests")
      .select("*, pets(name, species, avatar_url), profiles!walk_requests_requester_id_fkey(full_name, city)")
      .eq("status", "open")
      .order("scheduled_at", { ascending: true });
    allWalks = res.data || [];
    render();
  }

  async function alreadyJoined(walkRequestId) {
    if (!user) return false;
    var res = await db.from("walk_offers").select("id").eq("walk_request_id", walkRequestId).eq("walker_id", user.id).maybeSingle();
    return !!res.data;
  }

  function render() {
    pinMarkers.forEach(function (m) { map.removeLayer(m); });
    pinMarkers = [];

    var radius = parseFloat(radiusSelect.value);
    var withDistance = allWalks.map(function (w) {
      var d = window.petloop.distanceKm(refLoc.lat, refLoc.lng, w.latitude, w.longitude);
      return { w: w, dist: d };
    });

    var filtered = withDistance.filter(function (item) {
      return item.dist === null || item.dist <= radius;
    });
    filtered.sort(function (a, b) {
      if (a.dist === null) return 1;
      if (b.dist === null) return -1;
      return a.dist - b.dist;
    });

    walksHeading.textContent = myLoc ? "Walks Near You" : "Walks Near Cairo";
    listEl.innerHTML = "";
    emptyEl.style.display = filtered.length ? "none" : "block";

    filtered.forEach(function (item) {
      var w = item.w;
      var pet = w.pets || {};
      var owner = w.profiles || {};
      var distText = item.dist === null ? "" : " &middot; " + item.dist.toFixed(1) + "km away";

      if (w.latitude != null && w.longitude != null) {
        var marker = L.marker([w.latitude, w.longitude]).addTo(map);
        marker.bindPopup(
          '<b>' + window.petloop.escapeHtml(pet.name || "A PetLoop pet") + '</b><br>' +
          window.petloop.escapeHtml(w.location || "") + '<br>' +
          window.petloop.escapeHtml(timeLabel(w.scheduled_at))
        );
        pinMarkers.push(marker);
      }

      var card = document.createElement("div");
      card.className = "walk-card";
      card.innerHTML =
        '<div class="walk-map"><span class="icon "><img src="assets/icons/map-pin-coral.svg" alt=""></span></div>' +
        '<div class="walk-body">' +
        '<h4 style="margin:0 0 4px;">' + window.petloop.escapeHtml((pet.name ? pet.name + "'s " : "") + "Walk") + '</h4>' +
        '<div style="font-size:13.5px;color:var(--grey-light);margin-bottom:10px;">' +
        '<span class="icon "><img src="assets/icons/clock-grey.svg" alt=""></span> ' + window.petloop.escapeHtml(timeLabel(w.scheduled_at)) +
        ' &middot; <span class="icon "><img src="assets/icons/map-pin-grey.svg" alt=""></span> ' + window.petloop.escapeHtml(w.location || "Location TBD") + distText +
        '</div>' +
        (w.notes ? '<div style="font-size:13.5px;color:var(--grey);margin-bottom:8px;">' + window.petloop.escapeHtml(w.notes) + '</div>' : '') +
        '<div class="walk-avatars"><div class="avatar-ring sm"><div class="avatar-inner"><span class="icon "><img src="' + window.petloop.speciesIcon(pet.species) + '" alt=""></span></div></div></div>' +
        '</div>' +
        '<button type="button" class="btn btn-coral btn-sm join-btn"><span class="icon "><img src="assets/icons/walking-white.svg" alt=""></span> Join Walk</button>';

      var joinBtn = card.querySelector(".join-btn");
      if (user && w.requester_id === user.id) {
        joinBtn.disabled = true;
        joinBtn.textContent = "Your Walk";
      } else {
        alreadyJoined(w.id).then(function (joined) {
          if (joined) {
            joinBtn.disabled = true;
            joinBtn.innerHTML = '<span class="icon "><img src="assets/icons/check-white.svg" alt=""></span> Joined';
          }
        });
        joinBtn.addEventListener("click", async function () {
          if (!user) { window.location.href = "account.html?next=walks.html"; return; }
          joinBtn.disabled = true;
          joinBtn.textContent = "Joining...";
          var ins = await db.from("walk_offers").insert({ walk_request_id: w.id, walker_id: user.id });
          if (ins.error) {
            joinBtn.disabled = false;
            joinBtn.innerHTML = '<span class="icon "><img src="assets/icons/walking-white.svg" alt=""></span> Join Walk';
            alert("Couldn't join this walk: " + ins.error.message);
            return;
          }
          joinBtn.innerHTML = '<span class="icon "><img src="assets/icons/check-white.svg" alt=""></span> Joined';
        });
      }

      listEl.appendChild(card);
    });
  }

  radiusSelect.addEventListener("change", render);

  document.getElementById("post-walk-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!user) { window.location.href = "account.html?next=walks.html"; return; }
    if (!myPets.length) {
      showStatus(statusBox, "Add a pet to your account before posting a walk.", "error");
      return;
    }
    var submitBtn = document.getElementById("post-walk-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Posting...";

    var freshLoc = myLoc || await window.petloop.getBrowserLocation();

    var row = {
      requester_id: user.id,
      pet_id: petSelect.value,
      location: document.getElementById("walk-location").value.trim(),
      latitude: freshLoc ? freshLoc.lat : null,
      longitude: freshLoc ? freshLoc.lng : null,
      scheduled_at: document.getElementById("walk-datetime").value ? new Date(document.getElementById("walk-datetime").value).toISOString() : null,
      notes: document.getElementById("walk-notes").value.trim() || null,
      status: "open"
    };

    var ins = await db.from("walk_requests").insert(row);
    submitBtn.disabled = false;
    submitBtn.textContent = "Post Walk";
    if (ins.error) {
      showStatus(statusBox, ins.error.message, "error");
      return;
    }
    showStatus(statusBox, "Your walk is posted! Nearby owners can now see it and join.", "ok");
    document.getElementById("post-walk-form").reset();
    load();
  });

  load();
});
