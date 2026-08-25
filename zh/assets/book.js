/* Personal Book Forger — shared book JS.
   Handles: localStorage scoring, TOC/dashboard, per-chapter tests,
   the light/dark theme toggle, and a small registry of interactive
   demos used across chapters.
   Loaded from each chapter via <script src="assets/book.js" defer>.

   CONFIG: every page sets window.BOOK_CONFIG inline (in a <script> block
   on the page itself, before this file loads) to override the defaults
   below — at minimum: slug (kebab-case book id), lang ("en"/"zh"/...),
   and chapters (ordered list of {n, slug}). The slug + lang form the
   localStorage key prefix so scores namespace per language. */

(function () {
  "use strict";

  // ---- Config (overridable per book via window.BOOK_CONFIG) ----
  // Replace these defaults with your book's values, OR (preferred) set
  // window.BOOK_CONFIG inline on every page just before <script src="assets/book.js">.
  var CFG = Object.assign({
    slug: "my-book",
    lang: "en",
    passThreshold: 80,
    chapters: [
      { n: 1, slug: "01-example-chapter" }
    ]
  }, window.BOOK_CONFIG || {});

  // ---- Utilities ----
  function normalize(s) {
    return String(s).trim().toLowerCase().replace(/\s+/g, " ");
  }
  function storageKey(chapter) { return "book:" + CFG.slug + ":" + CFG.lang + ":ch:" + chapter; }
  function loadScore(chapter) {
    try { var v = localStorage.getItem(storageKey(chapter)); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }
  function saveScore(chapter, score, total, percent) {
    try {
      localStorage.setItem(storageKey(chapter), JSON.stringify({
        score: score, total: total, percent: percent,
        pass: percent >= CFG.passThreshold, ts: Date.now()
      }));
    } catch (e) { /* localStorage unavailable (private mode) */ }
  }

  // ============================================================
  // CHAPTER PAGE: tests
  // ============================================================
  function scoreQuestion(q) {
    var type = q.getAttribute("data-type");
    if (type === "mcq") {
      var correct = JSON.parse(q.getAttribute("data-correct") || "[]");
      var multiselect = q.getAttribute("data-multiselect") === "true";
      if (multiselect) {
        var inputs = q.querySelectorAll('input[type="checkbox"]');
        var selected = Array.prototype.filter.call(inputs, function (i) { return i.checked; })
                                       .map(function (i) { return i.value; });
        var allRight = correct.every(function (c) { return selected.indexOf(c) >= 0; });
        var noWrong = selected.every(function (s) { return correct.indexOf(s) >= 0; });
        return (allRight && noWrong) ? 1 : 0;
      }
      var input = q.querySelector('input[type="radio"]:checked');
      return (input && correct.indexOf(input.value) >= 0) ? 1 : 0;
    }
    if (type === "fill") {
      var accepted = JSON.parse(q.getAttribute("data-accepted") || "[]").map(normalize);
      var fills = q.querySelectorAll("input.fill");
      if (fills.length === 1) {
        return (accepted.indexOf(normalize(fills[0].value)) >= 0) ? 1 : 0;
      }
      // multi-blank: each value in accepted, no duplicates
      var vals = Array.prototype.map.call(fills, function (f) { return normalize(f.value); });
      var allFilled = vals.every(function (v) { return v.length > 0; });
      var noDup = vals.length === new Set(vals).size;
      var matched = accepted.filter(function (a) { return vals.indexOf(a) >= 0; });
      return (allFilled && noDup && matched.length === vals.length) ? 1 : 0;
    }
    if (type === "short") {
      var kpBox = q.querySelector(".key-points");
      var checks = kpBox ? kpBox.querySelectorAll('input[type="checkbox"]') : [];
      if (!checks.length) return 0;
      var checked = Array.prototype.filter.call(checks, function (c) { return c.checked; }).length;
      return checks.length ? checked / checks.length : 0;
    }
    return 0;
  }

  function showFeedback(q, earned) {
    var fb = q.querySelector(".feedback");
    if (!fb) return;
    var correct = (earned >= 1), partial = (earned > 0 && earned < 1);
    fb.className = "feedback shown " + (correct ? "correct" : (partial ? "partial" : "wrong"));
    var verdict = correct ? "✓ Correct" : (partial ? "△ Partial credit" : "✗ Revisit this");
    var answer = q.getAttribute("data-answer") || "";
    var rationale = q.getAttribute("data-rationale") || "";
    var review = q.getAttribute("data-review");
    var html = "<strong>" + verdict + "</strong>";
    if (answer) html += "<div>" + answer + "</div>";
    if (rationale) html += "<div class='rationale'>" + rationale + "</div>";
    if (review) html += "<div class='review-link'>→ <a href='#" + review + "'>review this section</a></div>";
    fb.innerHTML = html;
  }

  function ensureKeyPoints(q) {
    if (q.getAttribute("data-type") !== "short") return;
    var kpBox = q.querySelector(".key-points");
    if (!kpBox || kpBox.querySelector('input[type="checkbox"]')) return;
    var points = JSON.parse(q.getAttribute("data-key-points") || "[]");
    points.forEach(function (p, i) {
      var lbl = document.createElement("label");
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.setAttribute("data-kp", i);
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(" " + p));
      kpBox.appendChild(lbl);
    });
  }

  function lockQuestion(q) {
    Array.prototype.forEach.call(q.querySelectorAll("input, textarea"), function (el) { el.disabled = true; });
  }

  function scoreTest(form) {
    var chNum = form.getAttribute("data-chapter");
    var questions = form.querySelectorAll(".q");
    var total = questions.length, earned = 0;
    Array.prototype.forEach.call(questions, function (q) {
      ensureKeyPoints(q);
      var e = scoreQuestion(q);
      earned += e;
      showFeedback(q, e);
      lockQuestion(q);
    });
    var percent = total ? Math.round(100 * earned / total) : 0;
    saveScore(chNum, earned, total, percent);

    var pass = percent >= CFG.passThreshold;
    var resultEl = form.querySelector(".test-result");
    if (resultEl) {
      resultEl.className = "test-result shown " + (pass ? "pass" : "fail");
      var verdict = pass
        ? "Learned enough to move forward. ✓"
        : "Below " + CFG.passThreshold + "%. Re-read the highlighted sections, then retake. (Nothing is locked — you can still read the next chapter.)";
      resultEl.innerHTML =
        "<div class='score'>" + percent + "%</div>" +
        "<div class='verdict'>" + verdict + "</div>";
    }
    var submitBtn = form.querySelector(".submit-test");
    if (submitBtn) submitBtn.disabled = true;
    var retakeBtn = form.querySelector(".retake-btn");
    if (retakeBtn) retakeBtn.hidden = false;
  }

  function resetTest(form) {
    Array.prototype.forEach.call(form.querySelectorAll(".q"), function (q) {
      Array.prototype.forEach.call(q.querySelectorAll("input, textarea"), function (el) {
        el.disabled = false;
        if (el.type === "checkbox" || el.type === "radio") el.checked = false;
        else el.value = "";
      });
      var fb = q.querySelector(".feedback");
      if (fb) { fb.className = "feedback"; fb.innerHTML = ""; }
    });
    var resultEl = form.querySelector(".test-result");
    if (resultEl) { resultEl.className = "test-result"; resultEl.innerHTML = ""; }
    var submitBtn = form.querySelector(".submit-test");
    if (submitBtn) submitBtn.disabled = false;
    var retakeBtn = form.querySelector(".retake-btn");
    if (retakeBtn) retakeBtn.hidden = true;
  }

  document.addEventListener("submit", function (e) {
    if (e.target.classList && e.target.classList.contains("test")) {
      e.preventDefault();
      scoreTest(e.target);
    }
  });
  document.addEventListener("click", function (e) {
    if (e.target.classList && e.target.classList.contains("retake-btn")) {
      var form = e.target.closest("form.test");
      if (form) resetTest(form);
    }
  });
  document.addEventListener("focusin", function (e) {
    if (e.target.classList && e.target.classList.contains("short")) {
      var q = e.target.closest(".q");
      if (q) ensureKeyPoints(q);
    }
  });

  // ============================================================
  // CHAPTER PAGE: top nav (prev/next) + lang toggle
  // ============================================================
  function buildChapterNav(currentN) {
    var nav = document.querySelector(".topbar nav.chapter-nav");
    if (!nav) return;
    var ordered = CFG.chapters.slice().sort(function (a, b) { return a.n - b.n; });
    var prev = null, next = null;
    for (var i = 0; i < ordered.length; i++) {
      if (ordered[i].n === currentN) {
        prev = ordered[i - 1] || null;
        next = ordered[i + 1] || null;
      }
    }
    var html = "";
    if (prev) html += '<a href="' + prev.slug + '.html">← ' + prev.n + '</a>';
    else html += '<a class="disabled">←</a>';
    html += '<a href="index.html"> Contents</a>';
    if (next) html += '<a href="' + next.slug + '.html">' + next.n + ' →</a>';
    else html += '<a class="disabled">→</a>';
    nav.innerHTML = html;
  }

  // ============================================================
  // THEME (light/dark) — toggle button auto-injected into the topbar
  // ============================================================
  // The initial theme is applied BEFORE first paint by the tiny inline
  // snippet in each page's <head> (stored choice, else prefers-color-scheme,
  // else dark) so there is no flash of the wrong theme. Here we only inject
  // the toggle button and flip the attribute on click. The choice persists
  // in localStorage under a single book-agnostic key ("pbf:theme"), shared
  // across chapters AND languages (a reader's theme preference is not
  // per-language).
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function initThemeToggle() {
    var topbar = document.querySelector(".topbar");
    if (!topbar || topbar.querySelector(".theme-toggle")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "Toggle light/dark theme");
    function render() {
      var light = currentTheme() === "light";
      btn.textContent = light ? "☾" : "☀";
      btn.title = light ? "Switch to dark theme" : "Switch to light theme";
    }
    btn.addEventListener("click", function () {
      var next = currentTheme() === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("pbf:theme", next); } catch (e) { /* private mode */ }
      render();
    });
    render();
    // Sit before the lang-toggle when there is one, else at the bar's end.
    var lang = topbar.querySelector(".lang-toggle");
    topbar.insertBefore(btn, lang || null);
  }

  // ============================================================
  // TOC PAGE: build cards + dashboard
  // ============================================================
  function buildTocPage() {
    var grid = document.querySelector(".chapter-grid");
    if (!grid) return;
    var descs = window.CHAPTER_DESCS || {};
    var passed = 0;
    grid.innerHTML = "";
    CFG.chapters.forEach(function (ch) {
      var rec = loadScore(ch.n);
      if (rec && rec.pass) passed++;
      var statusClass = rec ? (rec.pass ? "pass" : "fail") : "";
      var statusText = rec
        ? (rec.pass ? "✓ passed (" + rec.percent + "%)" : "● taken (" + rec.percent + "%)")
        : "○ not started";
      var card = document.createElement("a");
      card.className = "chapter-card";
      card.href = ch.slug + ".html";
      card.innerHTML =
        '<div class="ch-num">CHAPTER ' + ch.n + '</div>' +
        '<div class="ch-title">' + (descs[ch.n] ? descs[ch.n].title : ("Chapter " + ch.n)) + '</div>' +
        '<div class="ch-desc">' + (descs[ch.n] ? descs[ch.n].desc : "") + '</div>' +
        '<div class="ch-status"><span class="dot ' + statusClass + '"></span>' + statusText + '</div>';
      grid.appendChild(card);
    });
    var pct = Math.round(100 * passed / CFG.chapters.length);
    var pb = document.getElementById("overall-progress");
    if (pb) pb.style.width = pct + "%";
    var pctLabel = document.getElementById("progress-pct");
    if (pctLabel) pctLabel.textContent = pct + "%";
    var passedLabel = document.getElementById("progress-passed");
    if (passedLabel) passedLabel.textContent = passed + " / " + CFG.chapters.length;
  }

  // ============================================================
  // DEMOS — registry of interactive widgets.
  // Each chapter can include <div class="demo" data-demo="NAME">…</div>
  // blocks. NAME looks up a handler here, which receives the demo's
  // root element. The handler is bound to any <button data-run> inside
  // the demo (click), plus range/text inputs (input event) and radios
  // (change event) for live demos.
  //
  // This template ships an EMPTY registry — each book authors its own
  // demos below. Pattern:
  //
  //   var demos = {
  //     myDemo: function (root) {
  //       var out = root.querySelector(".demo-output");
  //       out.classList.remove("empty");
  //       out.textContent = "…result…";
  //     }
  //   };
  //
  // Then in a chapter: <div class="demo" data-demo="myDemo">
  //   <button data-run>Run</button>
  //   <div class="demo-output empty">Click to run.</div>
  // </div>
  // ============================================================
  var demos = {
    // Demo registry for《Semantica × 本体专家之路》. Keep handlers small and
    // self-contained: no fetch(), no reaching outside the demo's root element.

    // Ch.1 — pick facts (each a triple), watch them accumulate into a graph.
    tripleBuilder: function (root) {
      var out = root.querySelector(".demo-output");
      if (!out) return;
      var boxes = root.querySelectorAll('input[type="checkbox"]');
      var lines = [], nodes = {}, edges = 0, literals = 0;
        Array.prototype.forEach.call(boxes, function (b) {
        if (!b.checked) return;
        var t = JSON.parse(b.getAttribute("data-triple"));
        // 字面量在展示时统一加引号，data-triple 里存纯值
        var o = t.oType === "literal" ? '"' + t.o + '"' : t.o;
        lines.push(t.s + "  " + t.p + "  " + o + " .");
        nodes[t.s] = true;
        if (t.oType === "iri") { nodes[t.o] = true; edges++; }
        else { literals++; }
      });
      out.classList.remove("empty");
      if (!lines.length) {
        out.textContent = "勾选下面的事实，然后点「构建图谱」。每勾一条 = 添加一条三元组。";
        return;
      }
      var iriCount = Object.keys(nodes).length;
      out.innerHTML =
        "<pre>Turtle（每行一条三元组：主语 谓语 宾语）\n\n" + lines.join("\n") + "</pre>" +
        "<div class='demo-note'>图中共 <strong>" + iriCount + "</strong> 个 IRI 节点、<strong>" +
        edges + "</strong> 条节点→节点的边、<strong>" + literals +
        "</strong> 个字面量叶子。注意：alice 这个 IRI 出现在多条三元组里，" +
        "正是「共享主语/宾语」把一条条三元组缝合成了图。</div>";
    },

    // Ch.1 — merge two sources: JSON key collision vs RDF triple union.
    mergeSemantics: function (root) {
      var out = root.querySelector(".demo-output");
      if (!out) return;
      out.classList.remove("empty");
      out.innerHTML =
        "<pre>来源 A（Salesforce，JSON）\n" +
        '{ "company": "ACME Corporation", "city": "SF" }\n\n' +
        "来源 B（年报 PDF，JSON）\n" +
        '{ "company": "Acme Corp.", "revenue": "2.4B" }\n\n' +
        "JSON 合并（同名 key 直接覆盖或冲突）→\n" +
        '{ "company": "???", "city": "SF", "revenue": "2.4B" }   ← company 打架了\n\n' +
        "─────────────────────────────────────\n\n" +
        "同样的两个来源，用 RDF 三元组表示（共同的 IRI = 同一个实体）→\n\n" +
        "ex:acme   schema:name   \"ACME Corporation\" .\n" +
        "ex:acme   schema:city   \"San Francisco\" .\n" +
        "ex:acme   schema:name   \"Acme Corp.\" .        ← 两个名字并存，不覆盖\n" +
        "ex:acme   ex:revenue   \"2.4B\" .\n\n" +
        "RDF 合并 = 三元组取并集 → 4 条三元组、1 个实体节点（ex:acme），\n" +
        "两个名字都保留，谁也不覆盖谁。名字只是属性，同一性由 IRI 决定。</pre>" +
        "<div class='demo-note'>若后续想判定两个名字指向同一实体，需要额外的" +
        "<strong>实体解析</strong>步骤（如 owl:sameAs，或 semantica.deduplication 模块），" +
        "RDF 本身不会替你自动合并。</div>";
    },

    // Ch.2 — RDFS subClassOf inference: watch type facts propagate up the chain.
    rdfsInference: function (root) {
      var out = root.querySelector(".demo-output");
      if (!out) return;
      out.classList.remove("empty");
      var base =
        "已知（explicit）三元组：\n" +
        ":CTO      rdfs:subClassOf  :Manager .\n" +
        ":Manager  rdfs:subClassOf  :Employee .\n" +
        ":worksFor rdfs:domain      :Person .\n\n" +
        "实例数据：\n" +
        ":alice    rdf:type  :CTO .\n" +
        ":carol    rdf:type  :Manager .\n" +
        ":alice    :worksFor :acme .\n";
      var derived =
        "\n推理机补出的（derived）三元组及理由：\n" +
        ":alice  rdf:type :Manager   ← subClassOf 传递（CTO ⊑ Manager）\n" +
        ":alice  rdf:type :Employee  ← subClassOf 传递（链式：CTO ⊑ Manager ⊑ Employee）\n" +
        ":alice  rdf:type :Person    ← worksFor 的 domain（谁用 worksFor 谁就是 Person）\n" +
        ":carol  rdf:type :Employee  ← subClassOf 传递（Manager ⊑ Employee）\n\n" +
        "注意：推理是「加事实」而不是「报错误」。alice 没写 rdf:type :Person，\n" +
        "但用了 worksFor 就被推出了 Person——RDFS 的 domain/range 是推理规则，\n" +
        "不是数据库意义上的外键检查。";
      out.innerHTML = "<pre>" + base + derived + "</pre>" +
        "<div class='demo-note'>如果换成封闭世界的数据库思维，你会问「alice 不是 Person 却用 worksFor，" +
        "要不要拒绝写入？」——RDFS 不拒绝，它直接把 alice 认定为 Person。想「校验/拒绝」" +
        "需要第 3 章的 SHACL。</div>";
    },

    // Ch.3 — a tiny deterministic SHACL validator over a fixed mini dataset.
    shaclPlayground: function (root) {
      var out = root.querySelector(".demo-output");
      if (!out) return;
      var boxes = root.querySelectorAll('input[type="checkbox"][data-mutation]');
      var data = [
        { id: "ex:alice",  name: "Alice Chen",  type: "Person",       valuation: null },
        { id: "ex:acme",   name: "Acme Corp",   type: "Organization", valuation: "1200000000" },
        { id: "ex:ghost",  name: null,          type: "Alien",        valuation: null }
      ];
      var mutations = {};
      Array.prototype.forEach.call(boxes, function (b) { mutations[b.getAttribute("data-mutation")] = b.checked; });
      if (mutations.noName) { data[0].name = null; }
      if (mutations.badType) { data[0].type = "Toaster"; }
      if (mutations.dupName) { data[1].name2 = "Acme Corp (copy)"; }

      var violations = [];
      data.forEach(function (d) {
        // sh:targetClass ex:Organization ; sh:property [ sh:path ex:name ; sh:minCount 1 ]
        if (d.type === "Organization" && !d.name) {
          violations.push({ sev: "Violation", cc: "MinCount", node: d.id, path: "ex:name",
            why: "Organization 的 ex:name 至少要 1 个值（sh:minCount 1），实际 0 个" });
        }
        if (d.type === "Organization" && d.valuation === null) {
          violations.push({ sev: "Violation", cc: "MinCount", node: d.id, path: "ex:valuation",
            why: "ex:valuation 至少 1 个值且须为 xsd:integer" });
        } else if (d.type === "Organization" && !/^-?\d+$/.test(d.valuation)) {
          violations.push({ sev: "Violation", cc: "Datatype", node: d.id, path: "ex:valuation",
            why: "ex:valuation 应为 xsd:integer，实际不是数字" });
        }
        // sh:in 允许值集合
        if (["Person", "Organization"].indexOf(d.type) < 0) {
          violations.push({ sev: "Violation", cc: "In", node: d.id, path: "rdf:type",
            why: 'rdf:type "' + d.type + '" 不在 sh:in 允许集合 {Person, Organization} 里' });
        }
      });
      out.classList.remove("empty");
      var lines = data.map(function (d) {
        return d.id + "  rdf:type " + (d.type || "?") + (d.name ? '  name "' + d.name + '"' : "  (无 name)");
      });
      var html = "<pre>数据图：\n" + lines.join("\n") + "\n\nShapes（约束集）：\n" +
        "ex:OrgShape a sh:NodeShape ;\n" +
        "    sh:targetClass ex:Organization ;\n" +
        "    sh:property [\n" +
        "        sh:path ex:name ;      sh:minCount 1 ;\n" +
        "        sh:path ex:valuation ; sh:datatype xsd:integer ; sh:minCount 1 ] ;\n" +
        '    sh:in ( ex:Person ex:Organization ) .   ← 简化示意\n</pre>';
      if (!violations.length) {
        html += "<div class='demo-note'><strong style='color:#34d399'>✓ conforms</strong> — 无违规。" +
          "勾选上面的「破坏数据」再运行，看报告怎么变。</div>";
      } else {
        html += "<pre>验证报告（sh:conforms " + "false" + "）：\n" +
          violations.map(function (v) {
            return "[" + v.sev + "] " + v.cc + "ConstraintComponent\n" +
              "    focus node: " + v.node + "   path: " + v.path + "\n" +
              "    " + v.why;
          }).join("\n") + "</pre>" +
          "<div class='demo-note'>每个违规 = 一条 sh:ValidationResult：focusNode（谁违规）+ resultPath（哪个属性）+" +
          "sourceConstraintComponent（哪类约束）+ resultSeverity（多严重）。Semantica 的 run_shacl_validation()" +
          "把 pyshacl 的结果图解析成完全同构的 SHACLViolation 列表（第 10 章）。</div>";
      }
      out.innerHTML = html;
    },

    // Ch.4 — live naming-convention checker (mimics NamingConventions.validate/suggest).
    namingCheck: function (root) {
      var out = root.querySelector(".demo-output");
      var clsInput = root.querySelector('input[data-kind="class"]');
      var propInput = root.querySelector('input[data-kind="property"]');
      if (!out || !clsInput || !propInput) return;
      out.classList.remove("empty");

      function toPascal(s) {
        return s.split(/[\s_\-]+/).filter(Boolean).map(function (w) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join("");
      }
      function toCamel(s) {
        var p = toPascal(s);
        return p.charAt(0).toLowerCase() + p.slice(1);
      }
      function singular(s) {
        if (/ies$/i.test(s)) return s.replace(/ies$/i, "y");
        if (/(ses|xes|zes|ches|shes)$/i.test(s)) return s.replace(/es$/i, "");
        if (/[^s]s$/i.test(s)) return s.replace(/s$/i, "");
        return s;
      }
      function report(kind, name) {
        if (!name.trim()) return kind + "名：待输入…\n";
        var line = "";
        if (kind === "class") {
          var ok = /^[A-Z][A-Za-z0-9]*$/.test(name);
          line += "类名 \"" + name + "\"  " + (ok ? "✓ PascalCase" : "✗ 不是 PascalCase") + "\n";
          if (!ok) line += "   建议：" + toPascal(name) + "\n";
          var sg = singular(name);
          if (sg !== name) line += "   另外它是复数，类名用单数：" + toPascal(sg) + "\n";
        } else {
          var okP = /^[a-z][A-Za-z0-9]*$/.test(name);
          line += "属性名 \"" + name + "\"  " + (okP ? "✓ camelCase" : "✗ 不是 camelCase") + "\n";
          if (!okP) line += "   建议：" + toCamel(singular(name)) + "\n";
        }
        return line;
      }
      out.innerHTML = "<pre>" +
        report("class", clsInput.value) + "\n" + report("property", propInput.value) + "</pre>" +
        "<div class='demo-note'>这正是 semantica/ontology/naming_conventions.py 里 NamingConventions" +
        ".validate_class_name / suggest_class_name / validate_property_name / suggest_property_name 做的事（简化版）：" +
        "类 PascalCase + 单数名词短语；属性 camelCase；校验不过就给建议名。</div>";
    },

    // Ch.5 — click a pipeline stage, see which subpackage owns it.
    pipelineTour: function (root) {
      var out = root.querySelector(".demo-output");
      if (!out) return;
      var sel = root.querySelector('input[type="radio"]:checked');
      out.classList.remove("empty");
      if (!sel) { out.textContent = "选择一个流水线阶段。"; return; }
      var STAGES = {
        ingest:   ["semantica.ingest", "FileIngestor · WebIngestor · DBIngestor · DatabricksIngestor · SnowflakeIngestor …", "文件/网页/数据库/流/企业数据平台 → 统一的原始文档列表"],
        parse:    ["semantica.parse + semantica.normalize", "DocumentParser · TextNormalizer · DateNormalizer · NumberNormalizer", "原始文档 → 干净的规范化文本（Unicode/日期/数字/别名）"],
        split:    ["semantica.split", "TextSplitter(method=entity_aware…) · RelationAwareChunker", "整篇文档 → 不切碎实体/三元组的分块（为 GraphRAG 优化）"],
        extract:  ["semantica.semantic_extract", "NamedEntityRecognizer · RelationExtractor · EventDetector · TripletExtractor", "文本 → 实体/关系/事件/三元组"],
        quality:  ["semantica.conflicts + semantica.deduplication", "ConflictDetector · ConflictResolver · DuplicateDetector · EntityMerger", "发现矛盾说法并仲裁；相似实体分组合并（保留 provenance）"],
        kg:       ["semantica.kg", "GraphBuilder(merge_entities=True) · EntityResolver · BiTemporalFact", "实体关系 → 知识图谱（entities/relationships 字典 + 时间事实）"],
        intel:    ["semantica.ontology · reasoning · provenance · context", "OntologyGenerator · ReteEngine/DatalogReasoner · ProvenanceManager · ContextGraph", "KG 之上：生成本体/SHACL、确定性推理、PROV-O 溯源、决策记录 → 增强版 KG"],
        storage:  ["semantica.vector_store · graph_store · triplet_store", "VectorStore(faiss/qdrant/…) · Neo4j/FalkorDB/AGE/Neptune · Oxigraph/Jena/RDF4J", "增强 KG 落地：向量检索 + LPG 图库 + RDF 三元组库，可互换"],
        output:   ["semantica.export + visualization + explorer/mcp_server/cli/server.py", "RDFExporter · KGVisualizer · REST API · MCP · CLI", "Turtle/Parquet/Cypher 导出、可视化、以及 REST/MCP/CLI 三种服务入口"]
      };
      var s = STAGES[sel.value];
      out.innerHTML = "<pre>阶段职责：" + s[2] + "\n\n所属模块：" + s[0] + "\n关键类：" + s[1] + "</pre>";
    },

    // Ch.6 — bi-temporal visibility: pick a query date, see which facts exist.
    biTemporal: function (root) {
      var out = root.querySelector(".demo-output");
      if (!out) return;
      var sel = root.querySelector('input[type="radio"]:checked');
      out.classList.remove("empty");
      if (!sel) { out.textContent = "选择一个查询日期。"; return; }
      var q = sel.getAttribute("data-date");
      var facts = [
        { s: "alice worksFor acme", vf: "2024-03-01", vu: "2025-01-01", r: "2024-03-05", note: "合同期间任职" },
        { s: "alice worksFor globex", vf: "2025-01-15", vu: "∞", r: "2025-01-20", note: "跳槽后任职" },
        { s: "acme valuation 1.2B", vf: "2024-06-01", vu: "∞", r: "2024-09-01", note: "9月才录入的估值" }
      ];
      function cmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
      function le(a, b) { return cmp(a, b) <= 0; }
      var lines = [], hidden = [];
      facts.forEach(function (f) {
        var valid = le(f.vf, q) && (f.vu === "∞" || le(q, f.vu));
        var known = le(f.r, q);
        if (valid && known) {
          lines.push("✓ 可见   " + f.s + "   (有效 " + f.vf + "→" + f.vu + "；录入 " + f.r + ")");
        } else {
          var why = !valid ? (cmp(q, f.vf) < 0 ? "尚未生效（世界时间未到 valid_from）" : "已失效（过了 valid_until）")
                           : "当时还不知道（recorded_at 在查询日之后）";
          hidden.push("✗ 不可见 " + f.s + "   ← " + why);
        }
      });
      out.innerHTML = "<pre>查询日期（state_at）：" + q + "\n\n" +
        (lines.length ? lines.join("\n") : "（无可见事实）") + "\n" +
        (hidden.length ? "\n" + hidden.join("\n") : "") + "</pre>" +
        "<div class='demo-note'>同一个查询日，'acme 估值' 三条里可能看不见——不是它 2024-06 还没生效，" +
        "而是 2024-09-01 才被录入（recorded_at 晚于查询日）。<strong>世界时间（valid）与认知时间（recorded）" +
        "是两根独立的轴</strong>，这正是 BiTemporalFact 的意义：能回答「当时我们以为什么」和「事实上当时如何」两个不同的问题。" +
        "源码：semantica/kg/temporal_model.py 的 BiTemporalFact、context_graph.py:3485 的 state_at。</div>";
    },

    // Ch.7 — trace ancestry vs analyze impact on a fixed decision chain.
    decisionGraph: function (root) {
      var out = root.querySelector(".demo-output");
      if (!out) return;
      var sel = root.querySelector('input[type="radio"]:checked');
      out.classList.remove("empty");
      if (!sel) { out.textContent = "选择一个查询。"; return; }
      var mode = sel.value;
      var chain =
        "决策图（实线=CAUSED，虚线=INFLUENCED）：\n" +
        "  d1 credit_application(A-7291 通过初审)\n" +
        "  d2 loan_underwriting(批准)\n" +
        "  d3 interest_rate(定 8.9%)\n" +
        "  d4 fraud_alert(触发人工复核)\n" +
        "  d1 ──CAUSED──▶ d2 ──CAUSED──▶ d3\n" +
        "  d1 ┄┄INFLUENCED┄┄▶ d4\n";
      var body;
      if (mode === "trace") {
        body = "\ntrace_decision_chain(d3)  ← 从 d3 向上追因果祖先：\n" +
          "  d3 interest_rate\n" +
          "    ↑ CAUSED by\n" +
          "  d2 loan_underwriting\n" +
          "    ↑ CAUSED by\n" +
          "  d1 credit_application          ← 根因：回到最初的申请决策\n";
      } else if (mode === "impact") {
        body = "\nanalyze_decision_impact(d1)  ← 从 d1 向下看影响了谁：\n" +
          "  d1 credit_application\n" +
          "    CAUSED ▶ d2 loan_underwriting\n" +
          "                CAUSED ▶ d3 interest_rate\n" +
          "    INFLUENCED ▶ d4 fraud_alert\n" +
          "  下游影响面：3 个决策（监管问「这个初审影响了什么」的答案）\n";
      } else {
        body = "\nfind_similar_decisions(\"personal loan, 31% DTI\")  ← 语义先例检索：\n" +
          "  命中 d1（相似场景：个人贷、31% DTI、3 年在职）\n" +
          "  命中 2023-Q4 的 d_loan_88（相似度 0.87）—— 先例可循\n";
      }
      out.innerHTML = "<pre>" + chain + body + "</pre>" +
        "<div class='demo-note'>关系类型受枚举约束：context_graph.py:494 的 _CAUSAL_EDGE_TYPES = " +
        "(CAUSED, INFLUENCED, PRECEDENT_FOR)，且 502-506 行有别名归一（CAUSES→CAUSED 等）。" +
        "trace 向上答「为什么」，impact 向下答「影响了什么」，similar 横向答「以前怎么处理的」——" +
        "决策智能的三个正交查询方向。</div>";
    },

    // Ch.8 — six-stage stepper for OntologyGenerator.
    sixStages: function (root) {
      var out = root.querySelector(".demo-output");
      if (!out) return;
      var sel = root.querySelector('input[type="radio"]:checked');
      out.classList.remove("empty");
      if (!sel) { out.textContent = "选择一个阶段。"; return; }
      var S = {
        s1: ["Stage 1 语义网络解析", "_stage1_parse_semantic_network()  ontology_generator.py:241",
          "输入：{entities:[…], relationships:[…]}\n" +
          "实体归一：dict / Entity 对象(label,text) / [text,label] 元组 / 批量嵌套列表 → 统一 dict\n" +
          "概念分组：按 entity type 建 concepts = {Person: {instances:[…], relationships:[…]}, …}\n" +
          "关系归一：dict / (subject,predicate,object) / 三元组列表；缺端点类型时按名字回查实体表\n" +
          "输出：{concepts, entities, relationships}"],
        s2: ["Stage 2 YAML→类定义", "_stage2_yaml_to_definition()  :395",
          "调 ClassInferrer.infer_classes(entities)（第 9 章精读）\n" +
          "输出：{classes:[{name,label,…}], properties:[], metadata:{generated_at, concept_count}}"],
        s3: ["Stage 3 定义→OWL 类型", "_stage3_definition_to_types()  :421",
          "调 PropertyGenerator.infer_properties(entities, relationships, classes)\n" +
          "类打 @type=\"owl:Class\" + 生成 IRI（namespace_manager.generate_class_iri）\n" +
          "属性按 type 字段打 @type=owl:ObjectProperty 或 owl:DatatypeProperty + 生成 IRI\n" +
          "输出：{classes:[{name,@type,uri,…}], properties:[…], metadata}\n" +
          "（:443-450 的注释记录了 #1103 修复：uri=None 曾让 not in 守卫失效）"],
        s4: ["Stage 4 层级生成", "_stage4_hierarchy_generation()  :468",
          "调 ClassInferrer.build_class_hierarchy(classes)（第 9 章：相似度合并+DFS 环检测）\n" +
          "组装本体骨架：{uri, name, version, classes, properties, imports:[], metadata:{class_count,…}}\n" +
          "输出：完整的本体字典"],
        s5: ["Stage 5 TTL 生成", "（不在 generate_ontology 内执行）:195",
          "docstring 注明「(Handled by OWLGenerator)」——本阶段只在你显式调用\n" +
          "OWLGenerator.generate_owl(ontology, format=\"turtle\") 时发生（第 2 章读过它的实现）\n" +
          "流水线返回的是 dict，序列化是可选的后续动作"],
        s6: ["Stage 6 符号验证", "generate_ontology 内 :197-211",
          "if options.get(\"validate\", True): validator.validate(ontology)\n" +
          "⚠  validator = OntologyValidator —— 第 3 章确认的占位实现\n" +
          "（consistent/satisfiable 是默认值；hermit/pellet 未实装）\n" +
          "想真校验：validate=False 跳过，再用 run_shacl_validation() 或 pyshacl 走 SHACL 路线"]
      };
      var d = S[sel.value];
      out.innerHTML = "<pre>【" + d[0] + "】\n位置：" + d[1] + "\n\n" + d[2] + "</pre>";
    },

    // Ch.9 — min_occurrences threshold slider: which classes survive.
    inferThreshold: function (root) {
      var out = root.querySelector(".demo-output");
      var slider = root.querySelector('input[type="range"]');
      if (!out || !slider) return;
      var n = parseInt(slider.value, 10);
      var counts = [["Person", 8], ["Organization", 5], ["Contract", 2], ["Money", 1], ["Product", 1]];
      var lines = [], kept = 0;
      counts.forEach(function (c) {
        var ok = c[1] >= n;
        if (ok) kept++;
        lines.push((ok ? "✓ 保留  " : "✗ 丢弃  ") + c[0].padEnd(14) + " 实例数 " + c[1] +
          (ok ? "" : "  < min_occurrences=" + n));
      });
      out.classList.remove("empty");
      out.innerHTML = "<pre>min_occurrences = " + n + "\n\n" + lines.join("\n") +
        "\n\n→ 生成的本体有 " + kept + " 个类\n</pre>" +
        "<div class='demo-note'>这就是 ClassInferrer.infer_classes（class_inferrer.py:96，判断在 :158）的全部核心逻辑：" +
        "按 type 分桶数实例，过不了频率门槛的类型不配成为类。滑到 1 会看到 Money/Product 这类" +
        "噪声全混进来；滑太高本体又缺胳膊少腿。默认 min_occurrences=2。" +
        "上游抽取的噪声类型直接决定这条曲线——第 6 章规范化不是可选项。</div>";
    }
  };

  function initDemos() {
    var roots = document.querySelectorAll(".demo[data-demo]");
    Array.prototype.forEach.call(roots, function (root) {
      var name = root.getAttribute("data-demo");
      var handler = demos[name];
      if (!handler) return;
      var runBtns = root.querySelectorAll("button[data-run]");
      Array.prototype.forEach.call(runBtns, function (btn) {
        btn.addEventListener("click", function () { handler(root); });
      });
      // also auto-run on input change for range/text inputs
      var inputs = root.querySelectorAll('input[type="range"], input[type="text"]');
      Array.prototype.forEach.call(inputs, function (inp) {
        inp.addEventListener("input", function () { handler(root); });
      });
      // radio changes
      var radios = root.querySelectorAll('input[type="radio"]');
      Array.prototype.forEach.call(radios, function (r) {
        r.addEventListener("change", function () { handler(root); });
      });
    });
  }

  // ============================================================
  // BOOT
  // ============================================================
  function boot() {
    initDemos();
    initThemeToggle();
    buildTocPage(); // no-op if not on TOC page
    var chapterEl = document.querySelector("main.chapter");
    if (chapterEl) {
      var n = parseInt(chapterEl.getAttribute("data-chapter-n"), 10);
      if (n) buildChapterNav(n);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
