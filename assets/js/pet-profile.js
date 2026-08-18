document.addEventListener("DOMContentLoaded", async function () {
  var db = window.petloop.db;
  var params = new URLSearchParams(window.location.search);
  var petId = params.get("id");
  var notFound = document.getElementById("pet-not-found");

  if (!petId) {
    notFound.style.display = "block";
    return;
  }

  var petRes = await db.from("pets").select("*, profiles!pets_owner_id_fkey(full_name, city)").eq("id", petId).single();
  if (petRes.error || !petRes.data) {
    notFound.style.display = "block";
    return;
  }

  var pet = petRes.data;
  var owner = pet.profiles || {};
  document.title = pet.name + (pet.breed ? " — " + pet.breed : "") + " | PetLoop";

  var avatarPhoto = document.getElementById("pet-avatar-photo");
  var avatarIconWrap = document.getElementById("pet-avatar-icon-wrap");
  if (pet.avatar_url) {
    avatarPhoto.src = pet.avatar_url;
    avatarPhoto.style.display = "block";
    avatarIconWrap.style.display = "none";
  } else {
    document.getElementById("pet-avatar-icon").src = window.petloop.speciesIcon(pet.species);
  }
  document.getElementById("pet-name-heading").textContent = pet.name;

  var subtitleParts = [pet.breed, pet.gender, window.petloop.ageFromBirthDate(pet.birth_date), owner.city].filter(Boolean);
  document.getElementById("pet-subtitle").textContent = subtitleParts.join(" · ");

  var badges = document.getElementById("pet-badges");
  badges.innerHTML = "";
  if (pet.vaccinated) {
    badges.innerHTML += '<span class="badge-pill badge-green"><span class="icon "><img src="assets/icons/syringe-green.svg" alt=""></span> Fully Vaccinated</span>';
  }
  if (pet.listed_for_matching) {
    badges.innerHTML += '<span class="badge-pill badge-gold"><span class="icon "><img src="assets/icons/handshake-white.svg" alt=""></span> Open to Matchmaking</span>';
  }

  document.getElementById("pet-bio").textContent = pet.bio || "";

  document.getElementById("pet-profile-root").style.display = "block";

  // ---- tab switching ----
  var tabs = document.querySelectorAll(".tabs .tab");
  var panels = { "panel-posts": null, "panel-certificates": null, "panel-health": null };
  Object.keys(panels).forEach(function (id) { panels[id] = document.getElementById(id); });
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function (e) {
      e.preventDefault();
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var target = tab.getAttribute("data-panel");
      Object.keys(panels).forEach(function (id) {
        panels[id].style.display = id === target ? "block" : "none";
      });
    });
  });

  // ---- am I the owner? ----
  var sessionUser = await window.petloop.getSessionUser();
  var isOwner = !!sessionUser && sessionUser.id === pet.owner_id;

  // ---- Request Match button: send straight to matchmaking pre-filtered for this pet ----
  var requestMatchBtn = document.querySelector('a[href="matchmaking.html"]');
  if (requestMatchBtn) {
    requestMatchBtn.href = "matchmaking.html?target=" + encodeURIComponent(pet.id);
  }

  // ---- Ready for Mating toggle (owner only) ----
  var matingWrap = document.getElementById("mating-toggle-wrap");
  var matingToggle = document.getElementById("mating-toggle");
  if (isOwner && matingWrap && matingToggle) {
    matingWrap.style.display = "block";
    document.getElementById("mating-toggle-pet-name").textContent = pet.name;
    if (pet.listed_for_matching) matingToggle.classList.add("on");
    matingToggle.addEventListener("click", async function () {
      var next = !matingToggle.classList.contains("on");
      matingToggle.classList.toggle("on", next);
      var upd = await db.from("pets").update({ listed_for_matching: next }).eq("id", pet.id);
      if (upd.error) {
        matingToggle.classList.toggle("on", !next);
        alert("Couldn't update mating status: " + upd.error.message);
        return;
      }
      pet.listed_for_matching = next;
      badges.innerHTML = badges.innerHTML.replace('<span class="badge-pill badge-gold"><span class="icon "><img src="assets/icons/handshake-white.svg" alt=""></span> Open to Matchmaking</span>', "");
      if (next) {
        badges.innerHTML += '<span class="badge-pill badge-gold"><span class="icon "><img src="assets/icons/handshake-white.svg" alt=""></span> Open to Matchmaking</span>';
      }
    });
  }

  var DOC_TYPE_LABEL = {
    certificate: "Pedigree / Breeding Certificate",
    championship: "Championship / Show Award",
    passport: "Pet Passport",
    vaccination: "Vaccination Record",
    other: "Health Record"
  };

  function renderDocRow(doc) {
    var meta = [DOC_TYPE_LABEL[doc.doc_type] || doc.doc_type];
    if (doc.issued_date) meta.push("Issued " + doc.issued_date);
    if (doc.expiry_date) meta.push("Expires " + doc.expiry_date);
    var verifiedBadge = doc.verified
      ? '<span class="badge-pill badge-green" style="margin-left:8px;"><span class="icon "><img src="assets/icons/circle-check-white.svg" alt=""></span> Verified</span>'
      : '<span class="badge-pill badge-grey" style="margin-left:8px;">Pending Review</span>';
    var row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML =
      '<div class="cart-thumb"><span class="icon "><img src="assets/icons/certificate-ink.svg" alt=""></span></div>' +
      '<div class="grow"><h4>' + window.petloop.escapeHtml(doc.title) + verifiedBadge + '</h4>' +
      '<span style="font-size:13px;color:var(--grey-light);">' + window.petloop.escapeHtml(meta.join(" · ")) + '</span></div>' +
      (doc.file_url ? '<button type="button" class="btn btn-outline-ink btn-sm view-doc-btn">View File</button>' : "");
    if (doc.file_url) {
      row.querySelector(".view-doc-btn").addEventListener("click", async function () {
        var url = await window.petloop.getPetDocumentSignedUrl(doc.file_url);
        if (url) window.open(url, "_blank");
      });
    }
    return row;
  }

  async function loadDocuments() {
    var certList = document.getElementById("certificates-list");
    var certEmpty = document.getElementById("certificates-empty");
    var healthList = document.getElementById("health-list");
    var healthEmpty = document.getElementById("health-empty");
    certList.innerHTML = "";
    healthList.innerHTML = "";

    if (isOwner) {
      // Full detail, owner-only (RLS also enforces this server-side).
      var docs = await window.petloop.listPetDocuments(petId);
      var certs = docs.filter(function (d) { return ["certificate", "championship", "passport"].indexOf(d.doc_type) !== -1; });
      var health = docs.filter(function (d) { return ["vaccination", "other"].indexOf(d.doc_type) !== -1; });

      certs.forEach(function (d) { certList.appendChild(renderDocRow(d)); });
      health.forEach(function (d) { healthList.appendChild(renderDocRow(d)); });
      certEmpty.style.display = certs.length ? "none" : "block";
      healthEmpty.style.display = health.length ? "none" : "block";

      document.getElementById("certificates-owner-tools").style.display = "block";
      document.getElementById("health-owner-tools").style.display = "block";
    } else {
      // Public visitors only see a privacy-safe summary (booleans/counts),
      // never the actual files — matches the pet_documents RLS policy.
      var summary = await window.petloop.getPetDocumentSummary(petId);
      var certCount = (summary && (summary.certificate_count + summary.championship_count)) || 0;
      var hasVax = summary && summary.has_vaccination_record;

      if (certCount > 0) {
        var certNote = document.createElement("p");
        certNote.className = "form-hint";
        certNote.textContent = certCount + " certificate/championship document" + (certCount === 1 ? "" : "s") + " on file with PetLoop (visible to the owner and Trust & Safety).";
        certList.appendChild(certNote);
        certEmpty.style.display = "none";
      } else {
        certEmpty.style.display = "block";
      }

      if (hasVax) {
        var healthNote = document.createElement("p");
        healthNote.className = "form-hint";
        healthNote.textContent = "Vaccination record on file with PetLoop (visible to the owner and Trust & Safety).";
        healthList.appendChild(healthNote);
        healthEmpty.style.display = "none";
      } else {
        healthEmpty.style.display = "block";
      }
    }
  }
  await loadDocuments();

  // ---- posts for this pet ----
  var postGrid = document.getElementById("pet-post-grid");
  var postEmpty = document.getElementById("pet-post-empty");
  var postsRes = await db.from("posts").select("*").eq("pet_id", petId).order("created_at", { ascending: false });
  var petPosts = postsRes.data || [];
  if (petPosts.length === 0) {
    postEmpty.style.display = "block";
  } else {
    postGrid.innerHTML = petPosts.map(function (post) {
      var inner = post.image_url
        ? '<img src="' + post.image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
        : '<span class="icon "><img src="assets/icons/camera-grey.svg" alt=""></span>';
      return '<div class="post-tile" title="' + window.petloop.escapeHtml(post.content || "") + '">' + inner + '</div>';
    }).join("");
  }

  // ---- add certificate/passport (owner only) ----
  var addCertBtn = document.getElementById("add-certificate-btn");
  var certForm = document.getElementById("certificate-form");
  if (addCertBtn) {
    addCertBtn.addEventListener("click", function () {
      certForm.style.display = certForm.style.display === "none" ? "block" : "none";
    });
  }
  var certFileInput = document.getElementById("cert-file");
  var certFileLabel = document.getElementById("cert-file-label");
  if (certFileInput) {
    certFileInput.addEventListener("change", function () {
      var f = certFileInput.files[0];
      certFileLabel.innerHTML = f ? "Selected: <b>" + window.petloop.escapeHtml(f.name) + "</b>" : "Drag &amp; drop a file, or <b>browse files</b>";
    });
  }
  if (certForm) {
    certForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var statusBox = document.getElementById("certificate-status");
      function showStatus(msg, kind) {
        statusBox.style.display = "block";
        statusBox.textContent = msg;
        statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
        statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
      }
      var submitBtn = document.getElementById("certificate-submit");
      var title = document.getElementById("cert-title").value.trim();
      if (!title) { showStatus("Please add a title.", "error"); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";

      var filePath = null;
      var file = certFileInput.files[0];
      if (file) {
        var up = await window.petloop.uploadPetDocumentFile(sessionUser.id, petId, file);
        if (up.error) {
          showStatus(up.error.message, "error");
          submitBtn.disabled = false;
          submitBtn.textContent = "Save Document";
          return;
        }
        filePath = up.path;
      }

      var res = await window.petloop.addPetDocument(sessionUser.id, petId, {
        doc_type: document.getElementById("cert-doc-type").value,
        title: title,
        file_url: filePath,
        issued_date: document.getElementById("cert-issued").value || null,
        expiry_date: document.getElementById("cert-expiry").value || null
      });
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Document";
      if (res.error) { showStatus(res.error.message, "error"); return; }

      showStatus("Saved! It will show as \"Verified\" once PetLoop's Trust & Safety team reviews it.", "ok");
      certForm.reset();
      certForm.style.display = "none";
      await loadDocuments();
    });
  }

  // ---- add health record (owner only) ----
  var addHealthBtn = document.getElementById("add-health-btn");
  var healthForm = document.getElementById("health-form");
  if (addHealthBtn) {
    addHealthBtn.addEventListener("click", function () {
      healthForm.style.display = healthForm.style.display === "none" ? "block" : "none";
    });
  }
  var healthFileInput = document.getElementById("health-file");
  var healthFileLabel = document.getElementById("health-file-label");
  if (healthFileInput) {
    healthFileInput.addEventListener("change", function () {
      var f = healthFileInput.files[0];
      healthFileLabel.innerHTML = f ? "Selected: <b>" + window.petloop.escapeHtml(f.name) + "</b>" : "Drag &amp; drop a file, or <b>browse files</b>";
    });
  }
  if (healthForm) {
    healthForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var statusBox = document.getElementById("health-status");
      function showStatus(msg, kind) {
        statusBox.style.display = "block";
        statusBox.textContent = msg;
        statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
        statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
      }
      var submitBtn = document.getElementById("health-submit");
      var title = document.getElementById("health-title").value.trim();
      if (!title) { showStatus("Please add a title.", "error"); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";

      var filePath = null;
      var file = healthFileInput.files[0];
      if (file) {
        var up = await window.petloop.uploadPetDocumentFile(sessionUser.id, petId, file);
        if (up.error) {
          showStatus(up.error.message, "error");
          submitBtn.disabled = false;
          submitBtn.textContent = "Save Document";
          return;
        }
        filePath = up.path;
      }

      var res = await window.petloop.addPetDocument(sessionUser.id, petId, {
        doc_type: document.getElementById("health-doc-type").value,
        title: title,
        file_url: filePath,
        issued_date: document.getElementById("health-issued").value || null,
        expiry_date: document.getElementById("health-expiry").value || null
      });
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Document";
      if (res.error) { showStatus(res.error.message, "error"); return; }

      showStatus("Saved!", "ok");
      healthForm.reset();
      healthForm.style.display = "none";
      await loadDocuments();
    });
  }

  // ---- Similar pets: same species, open to matchmaking, excluding this one. ----
  var similarRes = await db.from("pets")
    .select("*")
    .eq("species", pet.species)
    .eq("listed_for_matching", true)
    .neq("id", pet.id)
    .limit(3);

  var similarSection = document.getElementById("similar-pets-section");
  var grid = document.getElementById("similar-pets-grid");
  var emptyMsg = document.getElementById("similar-pets-empty");
  var similar = (similarRes.data || []);

  document.getElementById("similar-pets-heading").textContent = "Other " + pet.species + "s on PetLoop";
  similarSection.style.display = "block";

  if (similar.length === 0) {
    emptyMsg.style.display = "block";
    grid.innerHTML = "";
  } else {
    emptyMsg.style.display = "none";
    grid.innerHTML = similar.map(function (p) {
      return '' +
        '<div class="match-card">' +
        '<div class="match-media"><span class="icon "><img src="' + window.petloop.speciesIcon(p.species) + '" alt=""></span></div>' +
        '<div class="match-body"><h4>' + window.petloop.escapeHtml(p.name) + '</h4><div class="sub">' + window.petloop.escapeHtml(p.breed || p.species) + '</div><a href="pet-profile.html?id=' + p.id + '" class="btn btn-outline-ink btn-sm">View Profile</a></div>' +
        '</div>';
    }).join("");
  }
});
