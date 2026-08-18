document.addEventListener("DOMContentLoaded", function () {
  var form = document.getElementById("register-form");
  if (!form) return;

  var speciesInput = document.getElementById("pet-species");
  var breedInput = document.getElementById("pet-breed");
  var breedList = document.getElementById("breed-datalist");

  async function refreshBreedList() {
    var species = speciesInput.value;
    if (!window.petloop.speciesHasBreedList(species)) {
      breedList.innerHTML = "";
      breedInput.placeholder = "Type a breed (or leave blank)";
      return;
    }
    breedInput.placeholder = "Start typing to search " + species + " breeds...";
    var breeds = await window.petloop.fetchBreeds(species);
    breedList.innerHTML = breeds.map(function (b) {
      return '<option value="' + window.petloop.escapeHtml(b.breed_name) + '">';
    }).join("");
  }
  refreshBreedList();

  document.querySelectorAll("#species-picker .species-opt").forEach(function (opt) {
    opt.addEventListener("click", function () {
      speciesInput.value = opt.getAttribute("data-species");
      breedInput.value = "";
      refreshBreedList();
    });
  });

  var petPhotoInput = document.getElementById("pet-photo");
  var petPhotoLabel = document.getElementById("pet-photo-label");
  petPhotoInput.addEventListener("change", function () {
    var f = petPhotoInput.files[0];
    petPhotoLabel.innerHTML = f ? "Selected: <b>" + window.petloop.escapeHtml(f.name) + "</b>" : "Drag &amp; drop a photo, or <b>browse files</b>";
  });

  var vaxRecordInput = document.getElementById("vax-record");
  var vaxRecordLabel = document.getElementById("vax-record-label");
  vaxRecordInput.addEventListener("change", function () {
    var f = vaxRecordInput.files[0];
    vaxRecordLabel.innerHTML = f ? "Selected: <b>" + window.petloop.escapeHtml(f.name) + "</b>" : "Drag &amp; drop a vet record or certificate, or <b>browse files</b>";
  });

  var matchingInput = document.getElementById("pet-listed-for-matching");
  var matchingToggle = document.getElementById("matching-toggle");
  if (matchingToggle) {
    matchingToggle.addEventListener("click", function () {
      matchingInput.value = matchingToggle.classList.contains("on") ? "true" : "false";
    });
  }

  var statusBox = document.getElementById("register-status");
  function showStatus(message, kind) {
    statusBox.style.display = "block";
    statusBox.textContent = message;
    statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
    statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var submitBtn = document.getElementById("register-submit");

    var name = document.getElementById("reg-name").value.trim();
    var phone = document.getElementById("reg-phone").value.trim();
    var email = document.getElementById("reg-email").value.trim();
    var city = document.getElementById("reg-city").value.trim();
    var password = document.getElementById("reg-password").value;
    var petName = document.getElementById("pet-name").value.trim();

    if (!name || !email || !password || !petName) {
      showStatus("Please fill in your name, email, password and pet's name.", "error");
      return;
    }
    if (password.length < 6) {
      showStatus("Password must be at least 6 characters.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating your profile...";
    showStatus("Creating your account...", "ok");

    var pet = {
      name: petName,
      species: speciesInput.value,
      breed: document.getElementById("pet-breed").value.trim(),
      birth_date: document.getElementById("pet-dob").value || null,
      gender: document.getElementById("pet-gender").value,
      vaccinated: document.getElementById("pet-vaccination").value === "true",
      listed_for_matching: matchingInput.value === "true"
    };

    var db = window.petloop.db;
    var signUpRes = await db.auth.signUp({
      email: email,
      password: password,
      options: { data: { full_name: name } }
    });

    if (signUpRes.error) {
      showStatus(signUpRes.error.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Profile";
      return;
    }

    var session = signUpRes.data.session;
    var user = signUpRes.data.user;

    if (!session || !user) {
      // Email confirmation is required before we get a session. Save the
      // pet details and finish creating them the moment this person logs in.
      window.petloop.stashPendingPet(email, pet);
      showStatus("Account created! Check " + email + " to confirm your email, then log in from My Account to finish setting up " + petName + "'s profile.", "ok");
      submitBtn.textContent = "Check your email";
      return;
    }

    // Make sure the profile row (auto-created by a database trigger) has the
    // phone/city we collected too.
    await db.from("profiles").update({ phone: phone || null, city: city || null }).eq("id", user.id);

    var petRes = await window.petloop.insertPet(user.id, pet);
    if (petRes.error) {
      showStatus("Your account was created, but we couldn't save " + petName + " yet: " + petRes.error.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Profile";
      return;
    }
    var newPet = petRes.data;

    var photoFile = petPhotoInput.files[0];
    if (photoFile) {
      submitBtn.textContent = "Uploading photo...";
      var photoUp = await window.petloop.uploadPetMedia(user.id, photoFile);
      if (!photoUp.error) {
        await db.from("pets").update({ avatar_url: photoUp.publicUrl }).eq("id", newPet.id);
      }
    }

    var vaxFile = vaxRecordInput.files[0];
    if (vaxFile) {
      submitBtn.textContent = "Uploading vaccination record...";
      var vaxUp = await window.petloop.uploadPetDocumentFile(user.id, newPet.id, vaxFile);
      if (!vaxUp.error) {
        await window.petloop.addPetDocument(user.id, newPet.id, {
          doc_type: "vaccination",
          title: "Vaccination record",
          file_url: vaxUp.path
        });
      }
    }

    window.location.href = "pet-profile.html?id=" + newPet.id;
  });
});
