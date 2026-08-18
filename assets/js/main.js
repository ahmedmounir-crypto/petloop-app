document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      links.classList.toggle("open");
    });
  }

  // tabs
  document.querySelectorAll(".tabs").forEach(function (tabGroup) {
    tabGroup.querySelectorAll(".tab").forEach(function (tab) {
      tab.addEventListener("click", function (e) {
        e.preventDefault();
        tabGroup.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
      });
    });
  });

  // species picker
  document.querySelectorAll(".species-picker").forEach(function (group) {
    group.querySelectorAll(".species-opt").forEach(function (opt) {
      opt.addEventListener("click", function () {
        group.querySelectorAll(".species-opt").forEach(function (o) { o.classList.remove("active"); });
        opt.classList.add("active");
      });
    });
  });

  // toggles
  document.querySelectorAll(".toggle").forEach(function (t) {
    t.addEventListener("click", function () { t.classList.toggle("on"); });
  });

  // qty stepper
  document.querySelectorAll(".qty-stepper").forEach(function (stepper) {
    var span = stepper.querySelector("span");
    var buttons = stepper.querySelectorAll("button");
    if (buttons.length === 2 && span) {
      buttons[0].addEventListener("click", function () {
        var v = parseInt(span.textContent, 10);
        if (v > 1) span.textContent = v - 1;
      });
      buttons[1].addEventListener("click", function () {
        var v = parseInt(span.textContent, 10);
        span.textContent = v + 1;
      });
    }
  });

  // pdp thumbnails
  document.querySelectorAll(".pdp-thumbs").forEach(function (group) {
    group.querySelectorAll("div").forEach(function (t) {
      t.addEventListener("click", function () {
        group.querySelectorAll("div").forEach(function (o) { o.classList.remove("active"); });
        t.classList.add("active");
      });
    });
  });

  // chat list selection
  document.querySelectorAll(".chat-list-item").forEach(function (item) {
    item.addEventListener("click", function () {
      document.querySelectorAll(".chat-list-item").forEach(function (o) { o.classList.remove("active"); });
      item.classList.add("active");
    });
  });

  // slot selection
  document.querySelectorAll(".slot-grid").forEach(function (grid) {
    grid.querySelectorAll(".slot:not(.taken)").forEach(function (s) {
      s.addEventListener("click", function () {
        grid.querySelectorAll(".slot").forEach(function (o) { o.classList.remove("active"); });
        s.classList.add("active");
      });
    });
  });
});
