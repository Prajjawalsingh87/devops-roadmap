// DevOps Roadmap page: renders roadmap.json (generated from README.md by site/build.mjs).
(function () {
  "use strict";

  var STORAGE_KEY = "devops-roadmap:progress:v1";
  var state = { data: null, progress: {}, query: "", filter: "all" };
  var $ = function (id) { return document.getElementById(id); };

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress)); return true; } catch (e) { return false; }
  }
  // Unticked topics default to the README's [x]/[ ] state until the visitor changes them.
  function isDone(topic) {
    return Object.prototype.hasOwnProperty.call(state.progress, topic.id) ? state.progress[topic.id] : topic.done;
  }
  function textOf(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    return div.textContent || "";
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }
  function setBar(bar, done, total) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    bar.querySelector("span").style.width = pct + "%";
    bar.setAttribute("aria-valuenow", String(pct));
    bar.classList.toggle("complete", total > 0 && done === total);
    return pct;
  }

  function matches(topic, phase) {
    if (state.filter === "done" && !isDone(topic)) return false;
    if (state.filter === "todo" && isDone(topic)) return false;
    if (!state.query) return true;
    var hay = (topic.search + " " + phase.label + " " + phase.title).toLowerCase();
    return state.query.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
  }

  function renderPhases() {
    var root = $("roadmap");
    root.textContent = "";
    var shown = 0;
    state.data.phases.forEach(function (phase) {
      var visible = phase.topics.filter(function (t) { return matches(t, phase); });
      if (!visible.length) return;
      shown += visible.length;
      var headingId = "phase-" + phase.id;
      var count = el("span", { class: "phase-count" });
      var bar = el("div", { class: "bar", role: "progressbar", "aria-label": phase.label + " progress", "aria-valuemin": "0", "aria-valuemax": "100" }, [el("span")]);
      var list = el("ul", { class: "topics" });
      visible.forEach(function (topic) {
        var inputId = "topic-" + topic.id;
        var input = el("input", { type: "checkbox", id: inputId });
        input.checked = isDone(topic);
        input.addEventListener("change", function () {
          state.progress[topic.id] = input.checked;
          var saved = saveProgress();
          $("status").textContent = saved ? "" : "Browser storage is unavailable, so progress lasts for this visit only.";
          update();
        });
        var label = el("label", { for: inputId }, [el("span", { html: topic.html })]);
        var body = el("div", { class: "topic-body" }, [label]);
        if (topic.guide) body.appendChild(el("a", { class: "guide-link", href: topic.guide, text: "\ud83d\udcc4 Read the PDF guide" }));
        var item = el("li", { class: "topic" + (input.checked ? " is-done" : ""), "data-id": topic.id }, [input, body]);
        list.appendChild(item);
      });
      root.appendChild(el("article", { class: "phase", "aria-labelledby": headingId, "data-phase": phase.id }, [
        el("div", { class: "phase-head" }, [
          el("div", {}, [el("p", { class: "phase-label", text: phase.label }), el("h2", { id: headingId, text: phase.title })]),
          count,
        ]),
        bar,
        list,
      ]));
    });
    if (!shown) {
      root.appendChild(el("p", { class: "empty", text: state.query ? "No topics match “" + state.query + "”." : "Nothing here yet." }));
    }
    update();
  }

  // Refresh counts and bars without rebuilding the lists (keeps focus on the checkbox).
  function update() {
    var done = 0, total = 0;
    state.data.phases.forEach(function (phase) {
      var pDone = phase.topics.filter(isDone).length;
      done += pDone; total += phase.topics.length;
      var card = document.querySelector('[data-phase="' + phase.id + '"]');
      if (!card) return;
      setBar(card.querySelector(".bar"), pDone, phase.topics.length);
      var count = card.querySelector(".phase-count");
      count.textContent = pDone + "/" + phase.topics.length;
      count.classList.toggle("complete", pDone === phase.topics.length);
      count.setAttribute("aria-label", pDone + " of " + phase.topics.length + " topics done");
    });
    document.querySelectorAll(".topic").forEach(function (li) {
      li.classList.toggle("is-done", li.querySelector("input").checked);
    });
    var pct = setBar($("overall-bar"), done, total);
    $("overall-count").textContent = done + " of " + total + " topics · " + pct + "%";
  }

  function renderGuides() {
    var root = $("guides-list");
    state.data.guides.forEach(function (g) {
      var covered = el("ul", { class: "covered", "aria-label": "Covered topics" });
      (g.covered || []).forEach(function (c) { covered.appendChild(el("li", { text: c })); });
      root.appendChild(el("article", { class: "guide" }, [
        el("h3", { text: g.title }),
        el("p", { class: "guide-meta", text: [g.pages ? g.pages + " pages" : "", g.status].filter(Boolean).join(" · ") }),
        g.covered && g.covered.length ? covered : null,
        el("a", { class: "button", href: g.pdf, text: "Open PDF guide" }),
      ]));
    });
  }

  function init(data) {
    state.data = data;
    state.progress = loadProgress();
    data.phases.forEach(function (p) { p.topics.forEach(function (t) { t.search = (t.title + " " + textOf(t.html)).toLowerCase(); }); });
    if (data.tagline) $("tagline").textContent = data.tagline;

    var search = $("search");
    var params = new URLSearchParams(location.search);
    if (params.get("q")) { search.value = params.get("q"); state.query = search.value.trim().toLowerCase(); }
    search.addEventListener("input", function () {
      state.query = search.value.trim().toLowerCase();
      renderPhases();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== search && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
        e.preventDefault();
        search.focus();
      }
    });
    document.querySelectorAll("[data-filter]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.filter = btn.getAttribute("data-filter");
        document.querySelectorAll("[data-filter]").forEach(function (b) { b.setAttribute("aria-pressed", String(b === btn)); });
        renderPhases();
      });
    });
    $("reset").addEventListener("click", function () {
      if (!confirm("Reset your progress to the roadmap's defaults?")) return;
      state.progress = {};
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
      renderPhases();
    });
    renderPhases();
    renderGuides();
  }

  fetch("roadmap.json")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(init)
    .catch(function () {
      $("roadmap").innerHTML = '<p class="empty">Could not load the roadmap. It is also available in the <a href="https://github.com/Prajjawalsingh87/devops-roadmap#readme">README</a>.</p>';
    });
})();
