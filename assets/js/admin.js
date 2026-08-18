document.addEventListener("DOMContentLoaded", async function () {
  var db = window.petloop.db;
  var certTable = document.getElementById("cert-queue-table");
  var certEmpty = document.getElementById("cert-queue-empty");
  var verifyTable = document.getElementById("verify-queue-table");
  var verifyEmpty = document.getElementById("verify-queue-empty");
  if (!certTable || !verifyTable) return; // not on the admin page

  var user = await window.petloop.getSessionUser();
  var isAdmin = false;
  if (user) {
    var profRes = await db.from("profiles").select("role").eq("id", user.id).single();
    isAdmin = !!(profRes.data && profRes.data.role === "admin");
  }

  if (!isAdmin) {
    document.getElementById("admin-staff-only").style.display = "block";
    certEmpty.textContent = "Log in with an admin account to view this queue.";
    certEmpty.style.display = "block";
    verifyEmpty.textContent = "Log in with an admin account to view this queue.";
    verifyEmpty.style.display = "block";
    return;
  }

  function timeAgo(iso) {
    var diffMs = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diffMs / 60000);
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return Math.floor(hrs / 24) + "d ago";
  }

  var CERT_TYPE_LABEL = {
    certificate: "Pedigree / Breeding Certificate",
    championship: "Championship / Show Award",
    passport: "Pet Passport",
    vaccination: "Vaccination Record",
    other: "Health Record"
  };

  async function loadCertQueue() {
    var res = await db.from("pet_documents")
      .select("*, pets(name, species), profiles!pet_documents_owner_id_fkey(full_name, email)")
      .eq("verified", false)
      .order("created_at", { ascending: true });
    var docs = res.data || [];
    document.getElementById("stat-certs-pending").textContent = docs.length;

    // Keep the header row, drop any previous data rows.
    Array.from(certTable.querySelectorAll("tr")).slice(1).forEach(function (r) { r.remove(); });

    if (docs.length === 0) {
      certEmpty.style.display = "block";
      return;
    }
    certEmpty.style.display = "none";

    docs.forEach(function (doc) {
      var pet = doc.pets || {};
      var owner = doc.profiles || {};
      var tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + window.petloop.escapeHtml((pet.name || "Unknown pet") + (pet.species ? " (" + pet.species + ")" : "")) + "</td>" +
        "<td>" + window.petloop.escapeHtml(owner.full_name || owner.email || "Unknown") + "</td>" +
        "<td>" + window.petloop.escapeHtml(CERT_TYPE_LABEL[doc.doc_type] || doc.doc_type) + "</td>" +
        "<td>" + timeAgo(doc.created_at) + "</td>" +
        "<td></td>";
      var actionCell = tr.querySelector("td:last-child");

      if (doc.file_url) {
        var viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "btn btn-sm btn-outline-ink";
        viewBtn.textContent = "View File";
        viewBtn.style.marginRight = "8px";
        viewBtn.addEventListener("click", async function () {
          var url = await window.petloop.getPetDocumentSignedUrl(doc.file_url);
          if (url) window.open(url, "_blank");
        });
        actionCell.appendChild(viewBtn);
      }

      var verifyBtn = document.createElement("button");
      verifyBtn.type = "button";
      verifyBtn.className = "btn btn-sm btn-ink";
      verifyBtn.textContent = "Verify";
      verifyBtn.addEventListener("click", async function () {
        verifyBtn.disabled = true;
        verifyBtn.textContent = "Verifying...";
        await db.from("pet_documents").update({
          verified: true,
          verified_by: user.id,
          verified_at: new Date().toISOString()
        }).eq("id", doc.id);
        await loadCertQueue();
      });
      actionCell.appendChild(verifyBtn);

      certTable.appendChild(tr);
    });
  }

  async function loadVerifyQueue() {
    var res = await db.from("owner_verifications")
      .select("*, profiles!owner_verifications_profile_id_fkey(full_name, email)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    var subs = res.data || [];
    document.getElementById("stat-verifications-pending").textContent = subs.length;

    Array.from(verifyTable.querySelectorAll("tr")).slice(1).forEach(function (r) { r.remove(); });

    if (subs.length === 0) {
      verifyEmpty.style.display = "block";
      return;
    }
    verifyEmpty.style.display = "none";

    for (var i = 0; i < subs.length; i++) {
      (function (sub) {
        var owner = sub.profiles || {};
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" + window.petloop.escapeHtml(owner.full_name || owner.email || "Unknown") + "</td>" +
          "<td><button type=\"button\" class=\"btn btn-sm btn-outline-ink view-photo-btn\">View Photo</button></td>" +
          "<td><button type=\"button\" class=\"btn btn-sm btn-outline-ink view-video-btn\">View Video</button></td>" +
          "<td>" + timeAgo(sub.created_at) + "</td>" +
          "<td></td>";

        tr.querySelector(".view-photo-btn").addEventListener("click", async function () {
          var url = await window.petloop.getVerificationSignedUrl(sub.photo_url);
          if (url) window.open(url, "_blank");
        });
        tr.querySelector(".view-video-btn").addEventListener("click", async function () {
          var url = await window.petloop.getVerificationSignedUrl(sub.video_url);
          if (url) window.open(url, "_blank");
        });

        var actionCell = tr.querySelector("td:last-child");

        var approveBtn = document.createElement("button");
        approveBtn.type = "button";
        approveBtn.className = "btn btn-sm btn-ink";
        approveBtn.textContent = "Approve";
        approveBtn.style.marginRight = "8px";
        approveBtn.addEventListener("click", async function () {
          approveBtn.disabled = true;
          rejectBtn.disabled = true;
          await db.from("owner_verifications").update({
            status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString()
          }).eq("id", sub.id);
          await db.from("profiles").update({ verification_status: "verified" }).eq("id", sub.profile_id);
          await loadVerifyQueue();
        });

        var rejectBtn = document.createElement("button");
        rejectBtn.type = "button";
        rejectBtn.className = "btn btn-sm btn-outline-ink";
        rejectBtn.textContent = "Reject";
        rejectBtn.addEventListener("click", async function () {
          approveBtn.disabled = true;
          rejectBtn.disabled = true;
          await db.from("owner_verifications").update({
            status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString()
          }).eq("id", sub.id);
          await db.from("profiles").update({ verification_status: "rejected" }).eq("id", sub.profile_id);
          await loadVerifyQueue();
        });

        actionCell.appendChild(approveBtn);
        actionCell.appendChild(rejectBtn);
        verifyTable.appendChild(tr);
      })(subs[i]);
    }
  }

  await loadCertQueue();
  await loadVerifyQueue();
});
