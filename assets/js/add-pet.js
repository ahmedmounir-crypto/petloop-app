document.addEventListener("DOMContentLoaded", async function () {
  var user = await window.petloop.requireAuth();
  if (!user) return;

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

  var matchingInput = document.getElementById("pet-listed-for-matching");
  var matchingToggle = document.getElementById("matching-toggle");
  matchingToggle.addEventListener("click", function () {
    matchingInput.value = matchingToggle.classList.contains("on") ? "true" : "false";
  });

  var statusBox = document.getElementById("add-pet-status");
  function showStatus(message, kind) {
    statusBox.style.display = "block";
    statusBox.textContent = message;
    statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
    statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
  }

  document.getElementById("add-pet-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var submitBtn = document.getElementById("add-pet-submit");
    var petName = document.getElementById("pet-name").value.trim();
    if (!petName) {
      showStatus("Please enter your pet's name.", "error");
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding...";

    var pet = {
      name: petName,
      species: speciesInput.value,
      breed: document.getElementById("pet-breed").value.trim(),
      birth_date: document.getElementById("pet-dob").value || null,
      gender: document.getElementById("pet-gender").value,
      vaccinated: document.getElementById("pet-vaccination").value === "true",
      listed_for_matching: matchingInput.value === "true"
    };

    var res = await window.petloop.insertPet(user.id, pet);
    if (res.error) {
      showStatus(res.error.message, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "Add Pet";
      return;
    }
    var newPet = res.data;

    var photoFile = petPhotoInput.files[0];
    if (photoFile) {
      submitBtn.textContent = "Uploading photo...";
      var photoUp = await window.petloop.uploadPetMedia(user.id, photoFile);
      if (!photoUp.error) {
        await window.petloop.db.from("pets").update({ avatar_url: photoUp.publicUrl }).eq("id", newPet.id);
      }
    }

    window.location.href = "pet-profile.html?id=" + newPet.id;
  });
});
