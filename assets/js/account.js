document.addEventListener("DOMContentLoaded", async function () {
  var db = window.petloop.db;
  var loginSection = document.getElementById("account-login-section");
  var dashboardSection = document.getElementById("account-dashboard-section");

  async function finishPendingPetIfAny(user, email) {
    var pending = window.petloop.takePendingPet(email);
    if (!pending) return;
    await window.petloop.insertPet(user.id, pending);
  }

  async function renderDashboard(user) {
    loginSection.style.display = "none";
    dashboardSection.style.display = "block";

    var profRes = await db.from("profiles").select("*").eq("id", user.id).single();
    var profile = profRes.data;
    document.getElementById("welcome-name").textContent = "Welcome back, " + ((profile && profile.full_name) || user.email);

    var petsRes = await db.from("pets").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
    var pets = petsRes.data || [];
    document.getElementById("pets-count").textContent = pets.length;

    var list = document.getElementById("my-pets-list");
    if (pets.length === 0) {
      list.innerHTML = '<p class="form-hint">No pets yet. Add your first one!</p>';
    } else {
      list.innerHTML = pets.map(function (pet) {
        var sub = [pet.breed, pet.vaccinated ? "Fully Vaccinated" : null].filter(Boolean).join(" &middot; ");
        return '' +
          '<div class="cart-row">' +
          '<div class="avatar-ring sm"><div class="avatar-inner"><span class="icon "><img src="' + window.petloop.speciesIcon(pet.species) + '" alt=""></span></div></div>' +
          '<div class="grow"><h4>' + window.petloop.escapeHtml(pet.name) + '</h4><span style="font-size:13px;color:var(--grey-light);">' + sub + '</span></div>' +
          '<a href="pet-profile.html?id=' + pet.id + '" class="btn btn-outline-ink btn-sm">View</a>' +
          '</div>';
      }).join("");
    }

    await renderVerification(user, profile);
  }

  async function renderVerification(user, profile) {
    var badge = document.getElementById("verification-badge");
    var pendingNote = document.getElementById("verification-pending-note");
    var verifiedNote = document.getElementById("verification-verified-note");
    var form = document.getElementById("verification-form");
    var status = (profile && profile.verification_status) || "unverified";

    if (status === "verified") {
      badge.innerHTML = '<span class="badge-pill badge-green"><span class="icon "><img src="assets/icons/circle-check-white.svg" alt=""></span> Verified</span>';
      verifiedNote.style.display = "block";
      form.style.display = "none";
    } else if (status === "pending") {
      badge.innerHTML = '<span class="badge-pill badge-gold">Under Review</span>';
      pendingNote.style.display = "block";
      form.style.display = "none";
    } else {
      badge.innerHTML = status === "rejected"
        ? '<span class="badge-pill badge-grey">Resubmission Needed</span>'
        : '<span class="badge-pill badge-grey">Not Verified</span>';
      form.style.display = "block";
    }

    var photoInput = document.getElementById("verify-photo");
    var photoLabel = document.getElementById("verify-photo-label");
    var videoInput = document.getElementById("verify-video");
    var videoLabel = document.getElementById("verify-video-label");
    if (!form.dataset.wired) {
      form.dataset.wired = "1";
      photoInput.addEventListener("change", function () {
        var f = photoInput.files[0];
        photoLabel.innerHTML = f ? "Selected: <b>" + window.petloop.escapeHtml(f.name) + "</b>" : "Drag &amp; drop a photo, or <b>browse files</b>";
      });
      videoInput.addEventListener("change", function () {
        var f = videoInput.files[0];
        videoLabel.innerHTML = f ? "Selected: <b>" + window.petloop.escapeHtml(f.name) + "</b>" : "Drag &amp; drop a video, or <b>browse files</b>";
      });
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var statusBox = document.getElementById("verification-status");
      function showStatus(msg, kind) {
        statusBox.style.display = "block";
        statusBox.textContent = msg;
        statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
        statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
      }
      var photo = photoInput.files[0];
      var video = videoInput.files[0];
      if (!photo || !video) {
        showStatus("Please add both the photo and the short video.", "error");
        return;
      }
      var submitBtn = document.getElementById("verification-submit");
      submitBtn.disabled = true;
      submitBtn.textContent = "Uploading...";
      var res = await window.petloop.submitOwnerVerification(user.id, photo, video);
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit for Review";
      if (res.error) {
        showStatus(res.error.message, "error");
        return;
      }
      showStatus("Submitted! Your verification is now pending review.", "ok");
      var freshProfile = await db.from("profiles").select("*").eq("id", user.id).single();
      await renderVerification(user, freshProfile.data);
    }, { once: true });
  }

  function showLogin() {
    dashboardSection.style.display = "none";
    loginSection.style.display = "block";
  }

  var user = await window.petloop.getSessionUser();
  if (user) {
    await finishPendingPetIfAny(user, user.email);
    await renderDashboard(user);
  } else {
    showLogin();
  }

  var loginForm = document.getElementById("login-form");
  var loginStatus = document.getElementById("login-status");
  function showLoginStatus(message, kind) {
    loginStatus.style.display = "block";
    loginStatus.textContent = message;
    loginStatus.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
    loginStatus.style.color = kind === "error" ? "#B23B2E" : "#21403A";
  }

  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var submitBtn = document.getElementById("login-submit");
    var email = document.getElementById("login-email").value.trim();
    var password = document.getElementById("login-password").value;
    if (!email || !password) {
      showLoginStatus("Enter your email and password.", "error");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in...";
    var res = await db.auth.signInWithPassword({ email: email, password: password });
    if (res.error) {
      showLoginStatus(res.error.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Log In";
      return;
    }
    await finishPendingPetIfAny(res.data.user, email);
    var params = new URLSearchParams(window.location.search);
    var next = params.get("next");
    if (next) {
      window.location.href = next;
      return;
    }
    await renderDashboard(res.data.user);
  });

  var logoutLink = document.getElementById("logout-link");
  logoutLink.addEventListener("click", function (e) {
    e.preventDefault();
    window.petloop.signOut();
  });
});
