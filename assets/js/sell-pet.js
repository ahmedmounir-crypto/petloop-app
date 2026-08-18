document.addEventListener("DOMContentLoaded", async function () {
  var root = document.getElementById("sell-pet-root");
  if (!root) return; // not on the sell-pet page

  var db = window.petloop.db;
  var signedOut = document.getElementById("sell-pet-signed-out");
  var successSection = document.getElementById("sell-pet-success");

  var user = await window.petloop.getSessionUser();
  if (!user) {
    signedOut.style.display = "block";
    return;
  }
  root.style.display = "block";

  var petSelect = document.getElementById("sell-pet-select");
  var speciesPicker = document.getElementById("sell-pet-species-picker");
  var titleInput = document.getElementById("sell-pet-title");
  var selectedSpecies = "Dog";

  var myPets = await window.petloop.getMyPets(user.id);
  myPets.forEach(function (pet) {
    var opt = document.createElement("option");
    opt.value = pet.id;
    opt.textContent = pet.name + (pet.breed ? " (" + pet.breed + ")" : "");
    petSelect.appendChild(opt);
  });

  function setSpecies(species) {
    selectedSpecies = species;
    speciesPicker.querySelectorAll(".species-opt").forEach(function (opt) {
      opt.classList.toggle("active", opt.getAttribute("data-species") === species);
    });
  }

  speciesPicker.querySelectorAll(".species-opt").forEach(function (opt) {
    opt.addEventListener("click", function () {
      setSpecies(opt.getAttribute("data-species"));
    });
  });

  petSelect.addEventListener("change", function () {
    var petId = petSelect.value;
    if (!petId) return;
    var pet = myPets.find(function (p) { return p.id === petId; });
    if (!pet) return;
    if (!titleInput.value) {
      titleInput.value = pet.name + (pet.breed ? " — " + pet.breed : "");
    }
    if (pet.species) setSpecies(pet.species);
  });

  var photoInput = document.getElementById("sell-pet-photo");
  var photoLabel = document.getElementById("sell-pet-photo-label");
  photoInput.addEventListener("change", function () {
    var f = photoInput.files[0];
    photoLabel.innerHTML = f ? "Selected: <b>" + window.petloop.escapeHtml(f.name) + "</b>" : "Drag &amp; drop a photo, or <b>browse files</b>";
  });

  var statusBox = document.getElementById("sell-pet-status");
  function showStatus(msg, kind) {
    statusBox.style.display = "block";
    statusBox.textContent = msg;
    statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
    statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
  }

  document.getElementById("sell-pet-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var title = titleInput.value.trim();
    var price = parseFloat(document.getElementById("sell-pet-price").value);
    if (!title || isNaN(price) || price < 0) {
      showStatus("Please add a title and a valid price.", "error");
      return;
    }

    var submitBtn = document.getElementById("sell-pet-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Publishing...";

    var images = [];
    var photo = photoInput.files[0];
    if (photo) {
      var up = await window.petloop.uploadPetMedia(user.id, photo);
      if (up.error) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Publish Listing";
        showStatus("Photo upload failed: " + up.error.message, "error");
        return;
      }
      images.push(up.publicUrl);
    }

    var petId = petSelect.value || null;
    var res = await db.from("marketplace_listings").insert({
      seller_id: user.id,
      pet_id: petId,
      title: title,
      description: document.getElementById("sell-pet-description").value.trim() || null,
      price: price,
      category: selectedSpecies,
      images: images,
      status: "active"
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Publish Listing";

    if (res.error) {
      showStatus("Couldn't publish listing: " + res.error.message, "error");
      return;
    }

    root.style.display = "none";
    successSection.style.display = "block";
  });
});
