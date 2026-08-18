document.addEventListener("DOMContentLoaded", async function () {
  var root = document.getElementById("groomer-root");
  if (!root) return; // not on the groomer-profile page

  var db = window.petloop.db;
  var money = window.petloop.money;
  var notFound = document.getElementById("groomer-not-found");
  var params = new URLSearchParams(window.location.search);
  var groomerId = params.get("id");

  var SLOTS = [
    { value: "09:00", label: "9:00 AM" },
    { value: "10:00", label: "10:00 AM" },
    { value: "11:00", label: "11:00 AM" },
    { value: "13:00", label: "1:00 PM" },
    { value: "14:30", label: "2:30 PM" },
    { value: "16:00", label: "4:00 PM" },
    { value: "17:30", label: "5:30 PM" },
    { value: "19:00", label: "7:00 PM" }
  ];

  if (!groomerId) {
    notFound.style.display = "block";
    return;
  }

  var res = await db.from("groomers").select("*").eq("id", groomerId).single();
  if (res.error || !res.data) {
    notFound.style.display = "block";
    return;
  }

  var groomer = res.data;
  var services = Array.isArray(groomer.services) ? groomer.services : [];
  document.title = groomer.business_name + " | PetLoop";

  document.getElementById("groomer-gallery-main").innerHTML = groomer.avatar_url
    ? '<img src="' + groomer.avatar_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">'
    : '<span class="icon "><img src="assets/icons/scissors-ink.svg" alt=""></span>';

  document.getElementById("groomer-breadcrumb-name").textContent = groomer.business_name;
  document.getElementById("groomer-name").textContent = groomer.business_name;
  document.getElementById("groomer-location").innerHTML = '<span class="icon "><img src="assets/icons/map-pin-grey.svg" alt=""></span> ' + window.petloop.escapeHtml(groomer.city || "");
  document.getElementById("groomer-bio").textContent = groomer.bio || "";

  var full = Math.round(groomer.rating || 0);
  var starsHtml = "";
  for (var i = 0; i < 5; i++) {
    starsHtml += '<span class="icon "><img src="assets/icons/star-' + (i < full ? "gold" : "grey") + '.svg" alt=""></span>';
  }
  document.getElementById("groomer-stars").innerHTML = starsHtml + ' <span style="color:var(--grey);">' + (groomer.rating || 0).toFixed(1) + " &middot; " + (groomer.review_count || 0) + " reviews</span>";

  document.getElementById("groomer-services-list").innerHTML = services.map(function (s) {
    return '<div class="row"><span>' + window.petloop.escapeHtml(s.name) + '</span><span>' + money(s.price) + '</span></div>';
  }).join("") || '<p class="form-hint">No services listed yet.</p>';

  root.style.display = "block";

  var user = await window.petloop.getSessionUser();
  var signedOutBox = document.getElementById("groomer-booking-signed-out");
  var form = document.getElementById("groomer-booking-form");

  if (!user) {
    signedOutBox.style.display = "block";
    document.getElementById("groomer-login-link").href = "account.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
    return;
  }
  form.style.display = "block";

  var petSelect = document.getElementById("groomer-booking-pet");
  var myPets = await window.petloop.getMyPets(user.id);
  if (myPets.length === 0) {
    petSelect.innerHTML = '<option value="">Add a pet first from your account</option>';
  } else {
    petSelect.innerHTML = myPets.map(function (p) { return '<option value="' + p.id + '">' + window.petloop.escapeHtml(p.name) + '</option>'; }).join("");
  }

  var serviceSelect = document.getElementById("groomer-booking-service");
  serviceSelect.innerHTML = services.map(function (s, i) {
    return '<option value="' + i + '">' + window.petloop.escapeHtml(s.name) + ' — ' + money(s.price) + '</option>';
  }).join("");

  var dateInput = document.getElementById("groomer-booking-date");
  var today = new Date();
  dateInput.min = today.toISOString().slice(0, 10);

  var slotGrid = document.getElementById("groomer-slot-grid");
  var submitBtn = document.getElementById("groomer-booking-submit");
  var selectedSlot = null;

  dateInput.addEventListener("change", async function () {
    selectedSlot = null;
    submitBtn.disabled = true;
    var dateStr = dateInput.value;
    if (!dateStr) return;
    slotGrid.innerHTML = '<p class="form-hint">Loading availability...</p>';

    var bookedRes = await db.rpc("get_booked_slot_times", { p_groomer_id: groomerId, p_day: dateStr });
    var bookedTimes = (bookedRes.data || []).map(function (row) { return row.slot_time; });

    slotGrid.innerHTML = SLOTS.map(function (s) {
      var taken = bookedTimes.indexOf(s.value) !== -1;
      return '<div class="slot' + (taken ? " taken" : "") + '" data-time="' + s.value + '">' + s.label + '</div>';
    }).join("");

    slotGrid.querySelectorAll(".slot:not(.taken)").forEach(function (el) {
      el.addEventListener("click", function () {
        slotGrid.querySelectorAll(".slot").forEach(function (o) { o.classList.remove("active"); });
        el.classList.add("active");
        selectedSlot = el.getAttribute("data-time");
        submitBtn.disabled = false;
      });
    });
  });

  var statusBox = document.getElementById("groomer-booking-status");
  function showStatus(msg, kind) {
    statusBox.style.display = "block";
    statusBox.textContent = msg;
    statusBox.style.background = kind === "error" ? "#FBE8E4" : "#E9F2EC";
    statusBox.style.color = kind === "error" ? "#B23B2E" : "#21403A";
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!selectedSlot || !dateInput.value) {
      showStatus("Please pick a date and time.", "error");
      return;
    }
    var petId = petSelect.value;
    if (!petId) {
      showStatus("Please add a pet to your account first.", "error");
      return;
    }
    var service = services[parseInt(serviceSelect.value, 10)];
    submitBtn.disabled = true;
    submitBtn.textContent = "Booking...";

    var scheduledAt = dateInput.value + "T" + selectedSlot + ":00";
    var res2 = await db.from("grooming_bookings").insert({
      groomer_id: groomerId,
      customer_id: user.id,
      pet_id: petId,
      scheduled_at: scheduledAt,
      status: "pending",
      notes: service ? (service.name + " — " + money(service.price)) : null
    });

    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm Booking";

    if (res2.error) {
      showStatus("Couldn't book: " + res2.error.message, "error");
      return;
    }
    showStatus("Booked! " + groomer.business_name + " will confirm your appointment.", "ok");
    dateInput.dispatchEvent(new Event("change"));
  });
});
