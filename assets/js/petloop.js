/* PetLoop shared backend helpers (Supabase). Loaded on every page after the
   Supabase CDN script. Safe to keep the anon key here — it is a public key
   by design; real access control lives in the database's Row Level Security
   policies (see the RLS migration for this project). */
(function () {
  var SUPABASE_URL = "https://escqakjigojfjvlvaepe.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzY3Fha2ppZ29qZmp2bHZhZXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NzM2MTUsImV4cCI6MjEwMjU0OTYxNX0.blV1C70CtywJgy2miJYEaZN9gRTFn6YSkxLtOVot8Eo";

  if (typeof window.supabase === "undefined") {
    console.error("PetLoop: Supabase library did not load. Check the CDN script tag.");
    return;
  }

  window.petloop = window.petloop || {};
  var db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.petloop.db = db;

  // ---- species → icon filename (matches assets/icons/*-ink.svg set) ----
  var SPECIES_ICON = {
    Dog: "dog-ink.svg",
    Cat: "cat-ink.svg",
    Bird: "bird-ink.svg",
    Fish: "fish-ink.svg",
    Rabbit: "rabbit-ink.svg",
    Reptile: "turtle-ink.svg",
    Horse: "horse-ink.svg",
    Other: "paw-ink.svg"
  };
  window.petloop.speciesIcon = function (species) {
    return "assets/icons/" + (SPECIES_ICON[species] || SPECIES_ICON.Other);
  };

  // ---- misc helpers ----
  window.petloop.escapeHtml = function (str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  window.petloop.ageFromBirthDate = function (birthDateStr) {
    if (!birthDateStr) return null;
    var birth = new Date(birthDateStr);
    if (isNaN(birth.getTime())) return null;
    var now = new Date();
    var months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if (months < 1) return "Newborn";
    if (months < 24) return months + (months === 1 ? " month old" : " months old");
    var years = Math.floor(months / 12);
    return years + (years === 1 ? " year old" : " years old");
  };

  // ---- auth/session helpers ----
  window.petloop.getSessionUser = async function () {
    var res = await db.auth.getUser();
    if (res.error || !res.data || !res.data.user) return null;
    return res.data.user;
  };

  window.petloop.getMyProfile = async function () {
    var user = await window.petloop.getSessionUser();
    if (!user) return null;
    var res = await db.from("profiles").select("*").eq("id", user.id).single();
    if (res.error) return { user: user, profile: null };
    return { user: user, profile: res.data };
  };

  window.petloop.signOut = async function () {
    await db.auth.signOut();
    window.location.href = "index.html";
  };

  // Any page can require a logged-in user. Redirects to account.html if not.
  window.petloop.requireAuth = async function () {
    var user = await window.petloop.getSessionUser();
    if (!user) {
      window.location.href = "account.html?next=" + encodeURIComponent(window.location.pathname + window.location.search);
      return null;
    }
    return user;
  };

  // ---- "create my first pet at signup, even if email confirmation is
  // required before a session exists" handoff ----
  window.petloop.stashPendingPet = function (email, pet) {
    try {
      localStorage.setItem("petloop_pending_pet:" + email.toLowerCase(), JSON.stringify(pet));
    } catch (e) { /* ignore storage errors */ }
  };

  window.petloop.takePendingPet = function (email) {
    var key = "petloop_pending_pet:" + email.toLowerCase();
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      localStorage.removeItem(key);
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  window.petloop.insertPet = async function (ownerId, pet) {
    return db.from("pets").insert({
      owner_id: ownerId,
      name: pet.name,
      species: pet.species,
      breed: pet.breed || null,
      gender: pet.gender || null,
      birth_date: pet.birth_date || null,
      bio: pet.bio || null,
      vaccinated: !!pet.vaccinated,
      listed_for_matching: !!pet.listed_for_matching
    }).select().single();
  };

  // ---- breed directory (species -> breed picklist) ----
  // Species that don't have curated breed data (Fish, Reptile, Horse, Other)
  // fall back to free text in the UI rather than an empty dropdown.
  var BREED_BACKED_SPECIES = { Dog: true, Cat: true, Bird: true, Rabbit: true };
  window.petloop.speciesHasBreedList = function (species) {
    return !!BREED_BACKED_SPECIES[species];
  };
  window.petloop.fetchBreeds = async function (species) {
    if (!window.petloop.speciesHasBreedList(species)) return [];
    var res = await db.from("breeds").select("breed_name, group_or_category, size")
      .eq("species", species)
      .order("group_or_category", { ascending: true, nullsFirst: true })
      .order("breed_name", { ascending: true });
    return res.data || [];
  };

  // ---- file uploads ----
  function extOf(file) {
    var m = /\.[a-zA-Z0-9]+$/.exec(file.name || "");
    return m ? m[0] : "";
  }
  function randomToken() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  // Public bucket (pet photos, post media). Returns the public URL on success.
  window.petloop.uploadPetMedia = async function (ownerId, file) {
    var path = ownerId + "/" + randomToken() + extOf(file);
    var up = await db.storage.from("pet-media").upload(path, file, { upsert: false });
    if (up.error) return { error: up.error };
    var pub = db.storage.from("pet-media").getPublicUrl(path);
    return { path: path, publicUrl: pub.data.publicUrl };
  };

  // Private bucket (vaccination records, passports, certificates).
  // Stores under {ownerId}/{petId}/... so RLS can scope access to the owner + admins.
  window.petloop.uploadPetDocumentFile = async function (ownerId, petId, file) {
    var path = ownerId + "/" + petId + "/" + randomToken() + extOf(file);
    var up = await db.storage.from("pet-documents").upload(path, file, { upsert: false });
    if (up.error) return { error: up.error };
    return { path: path };
  };
  window.petloop.getPetDocumentSignedUrl = async function (path) {
    var res = await db.storage.from("pet-documents").createSignedUrl(path, 60);
    if (res.error) return null;
    return res.data.signedUrl;
  };

  // Private bucket (owner identity verification photo + video).
  window.petloop.uploadVerificationFile = async function (uid, file) {
    var path = uid + "/" + randomToken() + extOf(file);
    var up = await db.storage.from("verification-media").upload(path, file, { upsert: false });
    if (up.error) return { error: up.error };
    return { path: path };
  };
  window.petloop.getVerificationSignedUrl = async function (path) {
    var res = await db.storage.from("verification-media").createSignedUrl(path, 60);
    if (res.error) return null;
    return res.data.signedUrl;
  };

  // ---- pet documents (vaccination / passport / certificate / championship) ----
  window.petloop.addPetDocument = async function (ownerId, petId, doc) {
    return db.from("pet_documents").insert({
      pet_id: petId,
      owner_id: ownerId,
      doc_type: doc.doc_type,
      title: doc.title,
      file_url: doc.file_url || null,
      issued_date: doc.issued_date || null,
      expiry_date: doc.expiry_date || null,
      notes: doc.notes || null
    }).select().single();
  };
  window.petloop.listPetDocuments = async function (petId) {
    var res = await db.from("pet_documents").select("*").eq("pet_id", petId).order("created_at", { ascending: false });
    return res.data || [];
  };
  window.petloop.getPetDocumentSummary = async function (petId) {
    var res = await db.from("pet_document_summary").select("*").eq("pet_id", petId).maybeSingle();
    return res.data || null;
  };

  // ---- owner identity verification ----
  window.petloop.submitOwnerVerification = async function (profileId, photoFile, videoFile) {
    var photoUp = await window.petloop.uploadVerificationFile(profileId, photoFile);
    if (photoUp.error) return { error: photoUp.error };
    var videoUp = await window.petloop.uploadVerificationFile(profileId, videoFile);
    if (videoUp.error) return { error: videoUp.error };

    var insertRes = await db.from("owner_verifications").insert({
      profile_id: profileId,
      photo_url: photoUp.path,
      video_url: videoUp.path
    }).select().single();
    if (insertRes.error) return { error: insertRes.error };

    await db.from("profiles").update({ verification_status: "pending" }).eq("id", profileId);
    return { data: insertRes.data };
  };
  window.petloop.getMyLatestVerification = async function (profileId) {
    var res = await db.from("owner_verifications").select("*").eq("profile_id", profileId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    return res.data || null;
  };

  window.petloop.getMyPets = async function (ownerId) {
    var res = await db.from("pets").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false });
    return res.data || [];
  };

  // Great-circle distance in km between two lat/lng points.
  window.petloop.distanceKm = function (lat1, lon1, lat2, lon2) {
    if ([lat1, lon1, lat2, lon2].some(function (v) { return v === null || v === undefined || isNaN(v); })) return null;
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Wraps navigator.geolocation in a Promise; resolves {lat,lng} or null if denied/unavailable.
  window.petloop.getBrowserLocation = function () {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        function () { resolve(null); },
        { timeout: 8000, maximumAge: 60000 }
      );
    });
  };
})();
