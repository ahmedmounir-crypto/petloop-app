document.addEventListener("DOMContentLoaded", async function () {
  var grid = document.getElementById("match-grid");
  if (!grid) return; // not on the matchmaking page

  var db = window.petloop.db;
  var params = new URLSearchParams(window.location.search);
  var targetPetId = params.get("target");

  var emptyMsg = document.getElementById("match-grid-empty");
  var countLabel = document.getElementById("match-count-label");
  var sortSelect = document.getElementById("match-sort");
  var breedInput = document.getElementById("filter-breed");
  var locationInput = document.getElementById("filter-location");
  var verifiedOnlyInput = document.getElementById("filter-verified-only");
  var speciesChecks = document.querySelectorAll('.filter-row input[data-species]');
  var noPetBanner = document.getElementById("no-mating-pet-banner");
  var myPetRow = document.getElementById("matchmaking-my-pet-row");
  var myPetSelect = document.getElementById("my-mating-pet-select");
  var heading = document.getElementById("matchmaking-heading");

  var user = await window.petloop.getSessionUser();
  var myMatingPets = [];
  var myPet = null; // the pet we're finding matches FOR

  if (user) {
    var allMyPets = await window.petloop.getMyPets(user.id);
    myMatingPets = allMyPets.filter(function (p) { return p.listed_for_matching; });
  }

  if (myMatingPets.length === 0) {
    noPetBanner.style.display = "block";
  } else {
    myPetRow.style.display = "block";
    myPetSelect.innerHTML = myMatingPets.map(function (p) {
      return '<option value="' + p.id + '">' + window.petloop.escapeHtml(p.name) + ' (' + window.petloop.escapeHtml(p.breed || p.species) + ')</option>';
    }).join("");
    var preselect = targetPetId ? null : myMatingPets[0];
    myPet = preselect || myMatingPets[0];
    if (targetPetId) {
      // if the target pet belongs to us, there's nothing to match — just default to first pet
      myPetSelect.value = myMatingPets[0].id;
    }
    myPet = myMatingPets.find(function (p) { return p.id === myPetSelect.value; }) || myMatingPets[0];
    myPetSelect.addEventListener("change", function () {
      myPet = myMatingPets.find(function (p) { return p.id === myPetSelect.value; });
      applySpeciesFilterFromMyPet();
      load();
    });
  }

  function applySpeciesFilterFromMyPet() {
    if (!myPet) return;
    speciesChecks.forEach(function (c) {
      c.checked = c.getAttribute("data-species") === myPet.species;
    });
    heading.textContent = "Find the right match for " + myPet.name;
  }
  applySpeciesFilterFromMyPet();

  var allCandidates = [];
  var verifiedPetIds = {};

  async function load() {
    countLabel.textContent = "Loading matches…";
    var query = db.from("pets")
      .select("*, profiles!pets_owner_id_fkey(full_name, city)")
      .eq("listed_for_matching", true);
    if (user) query = query.neq("owner_id", user.id);

    var res = await query;
    var candidates = res.data || [];

    // Opposite gender to my pet, when known.
    if (myPet && myPet.gender) {
      var opposite = myPet.gender === "Male" ? "Female" : (myPet.gender === "Female" ? "Male" : null);
      if (opposite) candidates = candidates.filter(function (p) { return p.gender === opposite; });
    }

    allCandidates = candidates;

    // fetch verified certificate/championship docs for these pets in one go
    var ids = candidates.map(function (p) { return p.id; });
    verifiedPetIds = {};
    if (ids.length) {
      var docRes = await db.from("pet_documents")
        .select("pet_id")
        .in("pet_id", ids)
        .in("doc_type", ["certificate", "championship"])
        .eq("verified", true);
      (docRes.data || []).forEach(function (d) { verifiedPetIds[d.pet_id] = true; });
    }

    render();
  }

  function render() {
    var selectedSpecies = Array.from(speciesChecks).filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute("data-species"); });
    var breedTerm = breedInput.value.trim().toLowerCase();
    var locationTerm = locationInput.value.trim().toLowerCase();
    var verifiedOnly = verifiedOnlyInput.checked;

    var list = allCandidates.filter(function (p) {
      if (selectedSpecies.length && selectedSpecies.indexOf(p.species) === -1) return false;
      if (breedTerm && (!p.breed || p.breed.toLowerCase().indexOf(breedTerm) === -1)) return false;
      var city = (p.profiles && p.profiles.city) || "";
      if (locationTerm && city.toLowerCase().indexOf(locationTerm) === -1) return false;
      if (verifiedOnly && !verifiedPetIds[p.id]) return false;
      return true;
    });

    list = list.slice();
    if (sortSelect.value === "name") {
      list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    } else {
      list.sort(function (a, b) { return (verifiedPetIds[b.id] ? 1 : 0) - (verifiedPetIds[a.id] ? 1 : 0); });
    }

    countLabel.textContent = list.length + (list.length === 1 ? " match" : " matches") + (myPet ? " for " + myPet.name : "");
    grid.innerHTML = "";
    emptyMsg.style.display = list.length ? "none" : "block";

    list.forEach(function (p) {
      var owner = p.profiles || {};
      var isVerified = !!verifiedPetIds[p.id];
      var media = p.avatar_url
        ? '<img src="' + p.avatar_url + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
        : '<span class="icon "><img src="' + window.petloop.speciesIcon(p.species) + '" alt=""></span>';
      var badge = isVerified
        ? '<span class="badge-pill badge-gold" style="position:absolute;top:12px;left:12px;"><span class="icon "><img src="assets/icons/certificate-gold.svg" alt=""></span> Verified</span>'
        : '<span class="badge-pill badge-grey" style="position:absolute;top:12px;left:12px;"><span class="icon "><img src="assets/icons/xmark-grey.svg" alt=""></span> No Certificate</span>';

      var card = document.createElement("div");
      card.className = "match-card";
      card.innerHTML =
        '<div class="match-media">' + media + badge + '</div>' +
        '<div class="match-body">' +
        '<h4>' + window.petloop.escapeHtml(p.name) + '</h4>' +
        '<div class="sub">' + window.petloop.escapeHtml([p.breed, owner.city].filter(Boolean).join(" · ")) + '</div>' +
        '<div class="flex gap-8">' +
        '<a href="pet-profile.html?id=' + p.id + '" class="btn btn-outline-ink btn-sm">View Profile</a>' +
        '<button type="button" class="btn btn-coral btn-sm request-btn" ' + (myPet ? "" : "disabled") + '><span class="icon "><img src="assets/icons/handshake-white.svg" alt=""></span> Request</button>' +
        '</div></div>';

      var reqBtn = card.querySelector(".request-btn");
      reqBtn.addEventListener("click", async function () {
        if (!user) { window.location.href = "account.html?next=matchmaking.html"; return; }
        if (!myPet) return;
        reqBtn.disabled = true;
        reqBtn.textContent = "Sending...";
        var existing = await db.from("match_requests").select("id")
          .eq("requester_pet_id", myPet.id).eq("target_pet_id", p.id).maybeSingle();
        if (existing.data) {
          reqBtn.textContent = "Already Requested";
          return;
        }
        var ins = await db.from("match_requests").insert({
          requester_id: user.id,
          requester_pet_id: myPet.id,
          target_id: p.owner_id,
          target_pet_id: p.id,
          message: myPet.name + " is interested in a mating match with " + p.name + "."
        });
        if (ins.error) {
          reqBtn.disabled = false;
          reqBtn.innerHTML = '<span class="icon "><img src="assets/icons/handshake-white.svg" alt=""></span> Request';
          alert("Couldn't send request: " + ins.error.message);
          return;
        }
        reqBtn.innerHTML = '<span class="icon "><img src="assets/icons/check-white.svg" alt=""></span> Requested';
      });

      grid.appendChild(card);
    });
  }

  speciesChecks.forEach(function (c) { c.addEventListener("change", render); });
  breedInput.addEventListener("input", render);
  locationInput.addEventListener("input", render);
  verifiedOnlyInput.addEventListener("change", render);
  sortSelect.addEventListener("change", render);

  load();
});
