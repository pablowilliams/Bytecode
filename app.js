/* Bytecode — engine for an interactive monograph on the CPython interpreter.
   Vanilla JS, no dependencies. The figures are honest: the disassembly is
   produced from a small register of instructions; the value stack updates
   under those instructions exactly; the reference-counting figure increments
   and decrements integer counts according to a real script; the cyclic
   garbage collector implements a real mark-and-sweep; and the
   specialising-interpreter figure increments execution counters and replaces
   the executed opcode at the documented threshold.

   Two figures are deliberately rendered as semantic DOM rather than canvas
   per the accessibility review: the source-plus-disassembly listing and the
   value-stack table benefit from real text, screen-reader navigation and
   browser zoom in a way that canvas-rendered text cannot match.

   Built against a WCAG 2.2 AA pattern set. */
(function (global) {
  "use strict";

  var LW = 340, LH = 240, SCALE = 2;

  /* ---- small helpers -------------------------------------------------- */
  function el(t, c) { var e = document.createElement(t); if (c) e.className = c; return e; }
  function btn(c, t) { var b = el("button", c); b.type = "button"; b.textContent = t; return b; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function debounce(fn, ms) {
    var h = null;
    return function () { var a = arguments; if (h) clearTimeout(h);
      h = setTimeout(function () { fn.apply(null, a); }, ms); };
  }

  /* ---- drawing helpers ----------------------------------------------- */
  function cssVar(n) {
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || "#888";
  }
  function hexA(hex, a) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.substr(0,2),16), g = parseInt(hex.substr(2,2),16), b = parseInt(hex.substr(4,2),16);
    if (isNaN(r)) return "rgba(120,120,120," + a + ")";
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function clearBg(ctx, w) { ctx.fillStyle = cssVar("--bg-sunk"); ctx.fillRect(0, 0, w || LW, LH); }
  function line(ctx, a, b, color, lw, dash) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }
  function dot2(ctx, p, r, color) {
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fillStyle = color; ctx.fill();
  }
  function rect(ctx, x, y, w, h, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    if (stroke) { ctx.lineWidth = lw || 1.6; ctx.strokeStyle = stroke; ctx.strokeRect(x, y, w, h); }
  }
  function arrowTo(ctx, from, to, color, lw) {
    line(ctx, from, to, color, lw);
    var dx = to.x - from.x, dy = to.y - from.y, L = Math.sqrt(dx*dx+dy*dy) || 1;
    var ux = dx / L, uy = dy / L, lx = -uy, ly = ux;
    ctx.save(); ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - ux*7 + lx*3.6, to.y - uy*7 + ly*3.6);
    ctx.lineTo(to.x - ux*7 - lx*3.6, to.y - uy*7 - ly*3.6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawActive(ctx, c, label) {
    ctx.save();
    ctx.setLineDash([3, 3]); ctx.lineWidth = 2;
    ctx.strokeStyle = cssVar("--accent-d");
    ctx.beginPath(); ctx.arc(c.x, c.y, 19, 0, 6.2832); ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      ctx.font = "700 8px ui-sans-serif, sans-serif";
      var w = ctx.measureText(label).width + 6;
      ctx.fillStyle = cssVar("--accent-d");
      ctx.fillRect(c.x - w / 2, c.y - 32, w, 11);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center";
      ctx.fillText(label, c.x, c.y - 23.5);
      ctx.textAlign = "start";
    }
    ctx.restore();
  }

  /* ---- shared figure shell ------------------------------------------- *
   * Two variants: a canvas-backed shell for the graphical figures, and a *
   * DOM-backed shell for the source-and-disassembly listing and the      *
   * value-stack table, where real text and semantic structure are        *
   * preferred to canvas-rendered text.                                   */
  var seq = 0;
  function commonShell(opts, kind) {
    var uid = "bc" + (++seq);
    var fig = el("div", "figure");
    var controls = el("div", "controls");
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", opts.title + " controls");
    var stage = el("div", "grid-stage");
    var legend = el("ul", "legend");
    legend.setAttribute("aria-label", "Figure legend");
    var stats = el("div", "stats");
    var status = el("div", "status");
    status.id = uid + "-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = opts.status || "";
    fig.append(controls, stage, legend, stats, status);
    var cap = el("figcaption", "figure-cap");
    cap.innerHTML = opts.caption || "";
    fig.appendChild(cap);
    return { uid: uid, fig: fig, controls: controls, stage: stage,
             legend: legend, stats: stats, status: status };
  }
  function makeCanvas(opts) {
    var s = commonShell(opts, "canvas");
    var wrap = el("div", "canvas-wrap");
    var canvas = el("canvas", "figure-canvas");
    var cw = opts.wide ? LW + opts.wide : LW;
    canvas.width = cw * SCALE; canvas.height = LH * SCALE;
    canvas.style.aspectRatio = cw + " / " + LH;
    canvas.id = s.uid + "-c";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", opts.title + ".");
    canvas.setAttribute("aria-describedby", s.uid + "-help " + s.uid + "-desc");
    var help = el("p", "sr-only"); help.id = s.uid + "-help"; help.textContent = opts.help || "";
    var desc = el("p", "sr-only"); desc.id = s.uid + "-desc"; desc.textContent = opts.desc || "";
    wrap.append(canvas, help, desc);
    s.stage.appendChild(wrap);
    var ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);
    s.canvas = canvas; s.ctx = ctx; s.desc = desc; s.cw = cw;
    return s;
  }
  function makeDom(opts) {
    /* a DOM-backed figure: a focusable region with arrow keys, no canvas */
    var s = commonShell(opts, "dom");
    var region = el("div", "dom-region");
    region.id = s.uid + "-c";
    region.tabIndex = 0;
    region.setAttribute("role", "group");
    region.setAttribute("aria-label", opts.title);
    region.setAttribute("aria-describedby", s.uid + "-help " + s.uid + "-desc");
    var help = el("p", "sr-only"); help.id = s.uid + "-help"; help.textContent = opts.help || "";
    var desc = el("p", "sr-only"); desc.id = s.uid + "-desc"; desc.textContent = opts.desc || "";
    s.stage.appendChild(region);
    s.stage.appendChild(help);
    s.stage.appendChild(desc);
    s.region = region; s.desc = desc;
    return s;
  }
  function legendItem(swatchStyle, label, glyph) {
    var li = el("li", ""), sw = el("span", "swatch");
    sw.setAttribute("aria-hidden", "true");
    for (var k in swatchStyle) sw.style[k] = swatchStyle[k];
    if (glyph) sw.textContent = glyph;
    li.append(sw, document.createTextNode(label));
    return li;
  }
  function statBox(label) {
    var wrap = el("span", "stat"), b = el("b", "");
    b.textContent = "—";
    wrap.append(b, document.createTextNode(label));
    return { wrap: wrap, set: function (v) { b.textContent = v; } };
  }
  function group(nodes, sep) {
    var g = el("div", "control-group" + (sep ? " sep" : ""));
    nodes.forEach(function (n) { g.appendChild(n); });
    return g;
  }
  function radiogroup(label, items, onChange) {
    var set = el("div", "toolset");
    set.setAttribute("role", "radiogroup");
    set.setAttribute("aria-label", label);
    var current = items[0].value, radios = {};
    items.forEach(function (it, i) {
      var b = el("button", ""); b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", i === 0 ? "true" : "false");
      b.tabIndex = i === 0 ? 0 : -1;
      b.textContent = it.label; b.dataset.v = it.value;
      set.appendChild(b); radios[it.value] = b;
    });
    function select(v) {
      current = v;
      items.forEach(function (it) {
        var on = it.value === v;
        radios[it.value].setAttribute("aria-checked", on ? "true" : "false");
        radios[it.value].tabIndex = on ? 0 : -1;
      });
      onChange(v);
    }
    set.addEventListener("click", function (e) {
      var b = e.target.closest("[role=radio]");
      if (b) { select(b.dataset.v); b.focus(); }
    });
    set.addEventListener("keydown", function (e) {
      var idx = items.map(function (i) { return i.value; }).indexOf(current), h = true;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") idx = (idx + 1) % items.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") idx = (idx + items.length - 1) % items.length;
      else h = false;
      if (h) { e.preventDefault(); select(items[idx].value); radios[current].focus(); }
    });
    return { el: set, get: function () { return current; }, select: select };
  }
  function setStatus(node, text, tone) {
    node.textContent = text;
    if (tone) node.dataset.tone = tone; else node.removeAttribute("data-tone");
  }
  function slider(id, label, min, max, step, value, fmt, onInput) {
    var field = el("div", "field");
    var lab = el("label", ""); lab.htmlFor = id; lab.textContent = label;
    var input = el("input", "");
    input.type = "range"; input.id = id;
    input.min = min; input.max = max; input.step = step; input.value = value;
    var out = el("output", ""); out.setAttribute("for", id);
    out.setAttribute("aria-live", "off");
    out.textContent = fmt(value);
    input.setAttribute("aria-valuetext", label + " " + fmt(value));
    input.addEventListener("input", function () {
      var v = parseFloat(input.value);
      out.textContent = fmt(v);
      input.setAttribute("aria-valuetext", label + " " + fmt(v));
      onInput(v);
    });
    field.append(lab, input, out);
    return { field: field, input: input };
  }

  /* ---- A small bytecode program with synthetic source ---------------- *
   * A linear sequence of instructions. Each runs against a value stack;  *
   * the model is faithful to CPython's stack-machine architecture, with  *
   * opcode names borrowed where they match real CPython opcodes.        */
  var SRC_LINES = [
    "def total(a, b):",
    "    c = a + b",
    "    return c * 2"
  ];
  var DIS = [
    /* lineno is the source line each opcode came from (1-indexed) */
    { line: 2, op: "LOAD_FAST",  arg: "a",   action: { kind: "push", v: 5 } },
    { line: 2, op: "LOAD_FAST",  arg: "b",   action: { kind: "push", v: 7 } },
    { line: 2, op: "BINARY_ADD", arg: "",    action: { kind: "binop", op: "+" } },
    { line: 2, op: "STORE_FAST", arg: "c",   action: { kind: "store", name: "c" } },
    { line: 3, op: "LOAD_FAST",  arg: "c",   action: { kind: "loadName", name: "c" } },
    { line: 3, op: "LOAD_CONST", arg: "2",   action: { kind: "push", v: 2 } },
    { line: 3, op: "BINARY_MUL", arg: "",    action: { kind: "binop", op: "*" } },
    { line: 3, op: "RETURN_VALUE", arg: "",  action: { kind: "ret" } }
  ];

  /* ==================================================================== *
   *  Figure 1 — source, bytecode and the program counter (DOM)             *
   * ==================================================================== */
  function listingDemo(mount, config) {
    var s = makeDom({ title: "Source and bytecode with the program counter",
      help: "An interactive figure. The listing region is focusable: with the " +
        "figure focused, the right arrow key advances the program counter to " +
        "the next instruction and the left arrow key retreats. Home moves to " +
        "the first instruction; End to the last. The active instruction is " +
        "marked with a leading chevron, an aria-current attribute, and a " +
        "highlight. The Step and Reset buttons drive the same movement. " +
        "Press Tab to leave the figure.",
      status: "The program counter marks the next bytecode to execute.",
      caption: config.caption });
    var pc = 0;
    /* build the two side-by-side panes */
    var grid = el("div", "bc-grid");
    var leftLabel = el("h3", "bc-pane-label"); leftLabel.textContent = "Source";
    var src = el("pre", "bc-pre bc-src");
    var srcRows = SRC_LINES.map(function (text, i) {
      var span = el("span", "bc-line"); span.id = s.uid + "-src-" + (i + 1);
      var mark = el("span", "bc-mark"); mark.textContent = " ";
      mark.setAttribute("aria-hidden", "true");
      var code = el("span", "bc-code"); code.textContent = text;
      span.append(mark, code);
      return span;
    });
    srcRows.forEach(function (r, i) { src.appendChild(r); if (i < srcRows.length - 1) src.appendChild(document.createTextNode("\n")); });
    var rightLabel = el("h3", "bc-pane-label"); rightLabel.textContent = "Bytecode";
    var dis = el("ol", "bc-dis");
    dis.setAttribute("aria-label", "Disassembly");
    var disRows = DIS.map(function (ins, i) {
      var li = el("li", "bc-ins"); li.id = s.uid + "-ins-" + i;
      var mark = el("span", "bc-mark"); mark.textContent = " "; mark.setAttribute("aria-hidden", "true");
      var op = el("span", "bc-op"); op.textContent = ins.op;
      var arg = el("span", "bc-arg"); arg.textContent = ins.arg ? "  " + ins.arg : "";
      li.append(mark, op, arg);
      return li;
    });
    disRows.forEach(function (r) { dis.appendChild(r); });
    grid.append(leftLabel, src, rightLabel, dis);
    s.region.appendChild(grid);

    function setPC(n) {
      pc = clamp(n, 0, DIS.length - 1);
      var srcLine = DIS[pc].line;
      srcRows.forEach(function (r, i) {
        var on = i + 1 === srcLine;
        r.classList.toggle("bc-active", on);
        if (on) r.setAttribute("aria-current", "true"); else r.removeAttribute("aria-current");
        r.firstChild.textContent = on ? "▶" : " ";
      });
      disRows.forEach(function (r, i) {
        var on = i === pc;
        r.classList.toggle("bc-active", on);
        if (on) r.setAttribute("aria-current", "true"); else r.removeAttribute("aria-current");
        r.firstChild.textContent = on ? "▶" : " ";
      });
      s.desc.textContent = "Program counter at bytecode " + (pc + 1) + " of " +
        DIS.length + ", " + DIS[pc].op + (DIS[pc].arg ? " " + DIS[pc].arg : "") +
        ", from source line " + DIS[pc].line + ".";
      st.statPC.set((pc + 1) + " of " + DIS.length);
      st.statOp.set(DIS[pc].op);
    }
    var announce = debounce(function () {
      setStatus(s.status, "Step " + (pc + 1) + " of " + DIS.length + ": " +
        DIS[pc].op + (DIS[pc].arg ? " " + DIS[pc].arg : "") +
        " (source line " + DIS[pc].line + ").");
    }, 320);

    var stepBtn = btn("btn btn-primary", "Step");
    var backBtn = btn("btn", "Back");
    var resetBtn = btn("btn", "Reset");
    stepBtn.addEventListener("click", function () { setPC(pc + 1 >= DIS.length ? pc : pc + 1); announce(); });
    backBtn.addEventListener("click", function () { setPC(pc - 1); announce(); });
    resetBtn.addEventListener("click", function () { setPC(0); setStatus(s.status, "Reset to the first instruction."); });
    s.controls.append(group([stepBtn, backBtn, resetBtn]));

    s.region.addEventListener("keydown", function (e) {
      var h = true;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") setPC(pc + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setPC(pc - 1);
      else if (e.key === "Home") setPC(0);
      else if (e.key === "End") setPC(DIS.length - 1);
      else h = false;
      if (h) { e.preventDefault(); announce(); }
    });

    var st = { statPC: statBox(" program counter"), statOp: statBox(" opcode") };
    s.stats.append(st.statPC.wrap, st.statOp.wrap);
    s.legend.append(
      legendItem({ background: hexA(cssVar("--accent"), 0.25), boxShadow: "inset 0 0 0 2px " + cssVar("--accent") }, "Active line (chevron)"),
      legendItem({ background: cssVar("--bg-sunk") }, "Inactive line"));
    setPC(0);
    mount.appendChild(s.fig);
  }

  /* ==================================================================== *
   *  Figure 2 — the value stack (DOM table)                                *
   * ==================================================================== */
  function valueStackDemo(mount, config) {
    var s = makeDom({ title: "The value stack as bytecodes execute",
      help: "An interactive figure. The region is focusable: with the figure " +
        "focused, the right arrow key advances the bytecode and the left arrow " +
        "key undoes the most recent step. Home and End jump to the start and " +
        "end. Step, Back and Reset drive the same movement. The table below " +
        "the controls shows the stack after the most recent instruction, with " +
        "the top of the stack in the first row.",
      status: "Each bytecode pushes or pops on the value stack.",
      caption: config.caption });
    var pc = 0, stackHistory = [[]];
    var locals = {};
    function applyTo(stack, ins) {
      var copy = stack.slice();
      switch (ins.action.kind) {
        case "push":   copy.push(ins.action.v); break;
        case "binop": {
          var b = copy.pop(), a = copy.pop();
          copy.push(ins.action.op === "+" ? a + b : a * b);
          break;
        }
        case "store":  locals[ins.action.name] = copy.pop(); break;
        case "loadName": copy.push(locals[ins.action.name]); break;
        case "ret":    /* leave the stack as is; return takes from the top */ break;
      }
      return copy;
    }
    function rebuild() {
      stackHistory = [[]];
      locals = {};
      for (var i = 0; i < pc; i++) stackHistory.push(applyTo(stackHistory[stackHistory.length - 1], DIS[i]));
    }
    var table = el("table", "bc-stack");
    table.setAttribute("aria-label", "Value stack");
    var caption = el("caption", "bc-stack-caption");
    caption.textContent = "Value stack (top first)";
    var thead = el("thead", "");
    var thr = el("tr", "");
    var th1 = el("th", ""); th1.scope = "col"; th1.textContent = "Depth";
    var th2 = el("th", ""); th2.scope = "col"; th2.textContent = "Value";
    thr.append(th1, th2); thead.appendChild(thr);
    var tbody = el("tbody", "");
    table.append(caption, thead, tbody);
    s.region.appendChild(table);
    var insLabel = el("p", "bc-current-ins");
    s.region.appendChild(insLabel);

    function render() {
      var stack = stackHistory[stackHistory.length - 1];
      tbody.innerHTML = "";
      if (stack.length === 0) {
        var tr = el("tr", ""); var td = el("td", ""); td.colSpan = 2; td.textContent = "(stack is empty)";
        tr.appendChild(td); tbody.appendChild(tr);
      } else {
        for (var i = stack.length - 1; i >= 0; i--) {
          var tr2 = el("tr", "");
          var thd = el("th", ""); thd.scope = "row"; thd.textContent = (stack.length - 1 - i);
          var tdv = el("td", ""); tdv.textContent = String(stack[i]);
          tr2.append(thd, tdv); tbody.appendChild(tr2);
        }
      }
      var ins = DIS[Math.min(pc, DIS.length - 1)];
      var atEnd = pc >= DIS.length;
      insLabel.textContent = atEnd
        ? "Program complete. The top of the stack holds the return value."
        : "Next instruction: " + ins.op + (ins.arg ? " " + ins.arg : "");
      s.desc.textContent = "After " + pc + " of " + DIS.length + " instructions, " +
        "the stack contains " + (stack.length === 0 ? "no values" :
        stack.length === 1 ? "one value (" + stack[0] + ")" :
        stack.length + " values, top to bottom " +
          stack.slice().reverse().join(", ")) + ".";
      st.statDepth.set(String(stack.length));
      st.statTop.set(stack.length ? String(stack[stack.length - 1]) : "—");
      st.statStep.set(pc + " of " + DIS.length);
    }
    var announce = debounce(function () {
      var stack = stackHistory[stackHistory.length - 1];
      setStatus(s.status, "Stack now has " + stack.length + " value" +
        (stack.length === 1 ? "" : "s") +
        (stack.length ? "; top is " + stack[stack.length - 1] : "") + ".");
    }, 320);

    var stepBtn = btn("btn btn-primary", "Step");
    var backBtn = btn("btn", "Back");
    var resetBtn = btn("btn", "Reset");
    stepBtn.addEventListener("click", function () {
      if (pc < DIS.length) {
        stackHistory.push(applyTo(stackHistory[stackHistory.length - 1], DIS[pc]));
        pc++; render(); announce();
      }
    });
    backBtn.addEventListener("click", function () {
      if (pc > 0) { stackHistory.pop(); pc--; rebuild();
        for (var i = 0; i < pc; i++) ; /* locals rebuilt below */
        locals = {}; for (var j = 0; j < pc; j++) {
          if (DIS[j].action.kind === "store") locals[DIS[j].action.name] = stackHistory[j].slice().pop();
        }
        render(); announce();
      }
    });
    resetBtn.addEventListener("click", function () { pc = 0; stackHistory = [[]]; locals = {}; render();
      setStatus(s.status, "Reset to an empty stack.");
    });
    s.controls.append(group([stepBtn, backBtn, resetBtn]));

    s.region.addEventListener("keydown", function (e) {
      var h = true;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") stepBtn.click();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") backBtn.click();
      else if (e.key === "Home") { pc = 0; stackHistory = [[]]; locals = {}; render(); }
      else if (e.key === "End") { while (pc < DIS.length) stepBtn.click(); }
      else h = false;
      if (h) e.preventDefault();
    });

    var st = { statDepth: statBox(" stack depth"), statTop: statBox(" top of stack"),
      statStep: statBox(" instructions executed") };
    s.stats.append(st.statStep.wrap, st.statDepth.wrap, st.statTop.wrap);
    s.legend.append(
      legendItem({ background: cssVar("--bg") }, "Stack cell"),
      legendItem({ background: cssVar("--bg-sunk") }, "Header cell"));
    render();
    mount.appendChild(s.fig);
  }

  /* ==================================================================== *
   *  Figure 3 — reference counting on an object graph                      *
   * ==================================================================== */
  function refcountDemo(mount, config) {
    var s = makeCanvas({ title: "Reference counting on an object graph",
      help: "An interactive figure. Step advances through a short script that " +
        "creates and rebinds names; the object graph shows each object's " +
        "current reference count. The active-object control selects which " +
        "object the description focuses on. Press Tab to leave the figure.",
      status: "Each binding increments a refcount; each rebinding or deletion decrements one.",
      caption: config.caption });
    var steps = [
      { code: "a = [1, 2]",   action: { create: { id: "L1", kind: "list", repr: "[1,2]", x: 100, y: 90 }, bind: { name: "a", id: "L1" } } },
      { code: "b = a",        action: { bind: { name: "b", id: "L1" } } },
      { code: "c = a",        action: { bind: { name: "c", id: "L1" } } },
      { code: "del a",        action: { unbind: { name: "a" } } },
      { code: "d = [3]",      action: { create: { id: "L2", kind: "list", repr: "[3]", x: 240, y: 90 }, bind: { name: "d", id: "L2" } } },
      { code: "b = d",        action: { bind: { name: "b", id: "L2" } } },
      { code: "del c, b",     action: { unbind: { name: "c", also: "b" } } }
    ];
    var pc = 0;
    var objs = {}, names = {}, log = [];
    function reset() {
      pc = 0; objs = {}; names = {}; log = ["(no execution yet)"];
    }
    function refcount(id) {
      var n = 0; for (var k in names) if (names[k] === id) n++;
      return n;
    }
    function applyStep(st) {
      var a = st.action;
      if (a.create) {
        objs[a.create.id] = { id: a.create.id, kind: a.create.kind, repr: a.create.repr, x: a.create.x, y: a.create.y };
      }
      if (a.bind) {
        names[a.bind.name] = a.bind.id;
      }
      if (a.unbind) {
        delete names[a.unbind.name];
        if (a.unbind.also) delete names[a.unbind.also];
      }
      /* mark for collection any object whose refcount is now zero */
      for (var k in objs) {
        if (refcount(k) === 0) delete objs[k];
      }
    }
    var activeObj = "L1";
    function render() {
      var ctx = s.ctx;
      clearBg(ctx, s.cw);
      var bx = 14, by = 20, bw = 78, bh = 24, gap = 4;
      /* draw names box on the left */
      ctx.fillStyle = cssVar("--ink"); ctx.font = "700 9px ui-sans-serif, sans-serif";
      ctx.fillText("Names", bx, by - 6);
      var nKeys = Object.keys(names);
      if (nKeys.length === 0) {
        rect(ctx, bx, by, bw, bh, cssVar("--bg"), cssVar("--rule"), 1);
        ctx.fillStyle = cssVar("--ink-soft"); ctx.font = "10px ui-mono, monospace";
        ctx.fillText("(none)", bx + 8, by + 16);
      } else {
        nKeys.forEach(function (k, i) {
          var y = by + i * (bh + gap);
          rect(ctx, bx, y, bw, bh, cssVar("--bg"), cssVar("--accent-d"), 1.6);
          ctx.fillStyle = cssVar("--ink"); ctx.font = "10px ui-mono, monospace";
          ctx.fillText(k, bx + 6, y + 15);
        });
      }
      /* draw objects on the right */
      Object.keys(objs).forEach(function (id) {
        var o = objs[id];
        var sel = id === activeObj;
        rect(ctx, o.x - 32, o.y - 18, 64, 36, cssVar("--bg"),
          sel ? cssVar("--accent") : cssVar("--ink"), sel ? 2.2 : 1.6);
        ctx.fillStyle = cssVar("--ink"); ctx.font = "10px ui-mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(o.kind, o.x, o.y - 4);
        ctx.fillText(o.repr, o.x, o.y + 8);
        ctx.textAlign = "start";
        /* refcount badge */
        var rc = refcount(id);
        ctx.fillStyle = rc === 1 ? cssVar("--goal") : cssVar("--path");
        ctx.beginPath(); ctx.arc(o.x + 30, o.y - 16, 10, 0, 6.2832); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "700 11px ui-mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(String(rc), o.x + 30, o.y - 12);
        ctx.textAlign = "start";
        if (sel) drawActive(ctx, { x: o.x, y: o.y }, "active");
      });
      /* arrows from names to objects */
      ctx.font = "10px ui-mono, monospace";
      nKeys.forEach(function (k, i) {
        var y = by + i * (bh + gap) + bh / 2;
        var fromX = bx + bw + 2;
        var tid = names[k], to = objs[tid];
        if (!to) return;
        arrowTo(ctx, { x: fromX, y: y }, { x: to.x - 32 - 2, y: to.y - 4 }, hexA(cssVar("--accent"), 0.8), 1.6);
      });
      ctx.font = "10px ui-mono, monospace";
      ctx.fillStyle = cssVar("--ink-soft");
      ctx.fillText("$ " + (pc === 0 ? "(no execution yet)" : steps[pc - 1].code), 14, LH - 12);
      var rcA = objs[activeObj] ? refcount(activeObj) : 0;
      st.statStep.set(pc + " of " + steps.length);
      st.statSel.set(activeObj + (objs[activeObj] ? "" : " (freed)"));
      st.statRC.set(String(rcA));
      s.desc.textContent = "After " + pc + " of " + steps.length + " steps, " +
        Object.keys(objs).length + " object" + (Object.keys(objs).length === 1 ? "" : "s") +
        " remain. The selected object " + activeObj + " has " + (objs[activeObj] ? "refcount " + rcA + "." : "been freed.");
    }
    var announce = debounce(function () {
      setStatus(s.status, "Step " + pc + ": " + (pc === 0 ? "no execution yet"
        : steps[pc - 1].code) + ". Selected refcount " + (objs[activeObj] ? refcount(activeObj) : "freed") + ".");
    }, 340);

    var stepBtn = btn("btn btn-primary", "Step");
    var resetBtn = btn("btn", "Reset");
    stepBtn.addEventListener("click", function () {
      if (pc < steps.length) { applyStep(steps[pc]); pc++; render(); announce(); }
    });
    resetBtn.addEventListener("click", function () { reset(); render();
      setStatus(s.status, "Reset to before any execution.");
    });
    var rg = radiogroup("Active object", [
      { value: "L1", label: "Object L1" },
      { value: "L2", label: "Object L2" }
    ], function (v) { activeObj = v; render(); });
    s.controls.append(group([stepBtn, resetBtn]), group([rg.el], true));

    s.canvas.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { stepBtn.click(); e.preventDefault(); }
    });

    var st = { statStep: statBox(" step"), statSel: statBox(" selected object"),
      statRC: statBox(" selected refcount") };
    s.stats.append(st.statStep.wrap, st.statSel.wrap, st.statRC.wrap);
    s.legend.append(
      legendItem({ background: cssVar("--goal") }, "Refcount = 1"),
      legendItem({ background: cssVar("--path") }, "Refcount > 1"),
      legendItem({ background: cssVar("--accent-d") }, "Name binding"),
      legendItem({ boxShadow: "inset 0 0 0 2px " + cssVar("--accent") }, "Selected object"));
    reset();
    mount.appendChild(s.fig);
    render();
  }

  /* ==================================================================== *
   *  Figure 4 — the cyclic garbage collector                               *
   * ==================================================================== */
  function gcDemo(mount, config) {
    var s = makeCanvas({ title: "Cyclic garbage collection",
      help: "An interactive figure. The graph starts with a cycle of two " +
        "objects that reference one another, plus a third reachable from the " +
        "root. Run GC performs a mark-and-sweep over the graph; the active " +
        "object the description focuses on is selected by the radiogroup. " +
        "Press Tab to leave the figure.",
      status: "Reference counting alone cannot reclaim an unreachable cycle.",
      caption: config.caption });
    var objs;
    function reset() {
      objs = {
        R: { x: 50,  y: 60,  ref: ["A"], name: "root", kind: "frame",   marked: false, reachable: true,  alive: true },
        A: { x: 150, y: 50,  ref: ["B"], name: "A",    kind: "instance",marked: false, reachable: false, alive: true },
        B: { x: 250, y: 80,  ref: ["A"], name: "B",    kind: "instance",marked: false, reachable: false, alive: true },
        C: { x: 150, y: 160, ref: [],    name: "C",    kind: "list",    marked: false, reachable: false, alive: true }
      };
      objs.R.ref = ["C"];
      objs.A.ref = ["B"];
      objs.B.ref = ["A"];
    }
    reset();
    var active = "A";
    function runGC() {
      /* mark phase: traverse from the root */
      Object.keys(objs).forEach(function (k) { objs[k].marked = false; });
      var stack = ["R"];
      while (stack.length) {
        var k = stack.pop();
        if (!objs[k] || objs[k].marked) continue;
        objs[k].marked = true;
        objs[k].ref.forEach(function (r) { stack.push(r); });
      }
      /* sweep phase: anything unmarked is collected */
      Object.keys(objs).forEach(function (k) {
        objs[k].reachable = objs[k].marked;
        if (!objs[k].marked) objs[k].alive = false;
      });
    }
    function render() {
      var ctx = s.ctx;
      clearBg(ctx);
      /* edges first */
      Object.keys(objs).forEach(function (k) {
        var o = objs[k]; if (!o.alive) return;
        o.ref.forEach(function (r) {
          var t = objs[r]; if (!t || !t.alive) return;
          arrowTo(ctx, { x: o.x + 22, y: o.y }, { x: t.x - 22, y: t.y }, hexA(cssVar("--accent-d"), 0.85), 1.8);
        });
      });
      /* nodes */
      Object.keys(objs).forEach(function (k) {
        var o = objs[k]; if (!o.alive) return;
        var sel = k === active;
        var fill = o.reachable ? cssVar("--bg") : hexA(cssVar("--path"), 0.35);
        var stroke = sel ? cssVar("--accent") : cssVar("--ink");
        rect(ctx, o.x - 24, o.y - 18, 48, 36, fill, stroke, sel ? 2.4 : 1.6);
        ctx.fillStyle = cssVar("--ink"); ctx.font = "10px ui-mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(o.name, o.x, o.y - 4);
        ctx.fillText(o.kind, o.x, o.y + 9);
        ctx.textAlign = "start";
        if (sel) drawActive(ctx, { x: o.x, y: o.y }, "active");
        /* a clear non-colour marker for the reachability state */
        if (o.marked) {
          ctx.fillStyle = cssVar("--goal");
          ctx.beginPath(); ctx.arc(o.x - 24 + 8, o.y - 18 + 8, 4, 0, 6.2832); ctx.fill();
        }
      });
      /* show a roll-call of survivors and collected */
      var survivors = Object.keys(objs).filter(function (k) { return objs[k].alive; });
      var collected = Object.keys(objs).filter(function (k) { return !objs[k].alive; });
      st.statAlive.set(String(survivors.length));
      st.statColl.set(String(collected.length));
      var act = objs[active];
      st.statSel.set(act && act.alive ? (act.marked ? "reachable" : "unreachable") : "collected");
      s.desc.textContent = survivors.length + " objects remain after the last " +
        "garbage collection; " + collected.length + " have been collected. " +
        "The selected object " + active + " is " + (st.statSel.set, st.statSel.set.toString.call ? "" : "") +
        (act && act.alive ? (act.marked ? "reachable from the root" : "currently unreachable") : "collected") + ".";
    }
    var announce = debounce(function () {
      var coll = Object.keys(objs).filter(function (k) { return !objs[k].alive; });
      setStatus(s.status, coll.length === 0 ? "No cycle has been collected yet; the cyclic A and B still survive."
        : "Mark-and-sweep collected " + coll.length + " object" + (coll.length === 1 ? "" : "s") + ".",
        coll.length ? "win" : "");
    }, 340);

    var gcBtn = btn("btn btn-primary", "Run GC");
    gcBtn.addEventListener("click", function () { runGC(); render(); announce(); });
    var resetBtn = btn("btn", "Reset");
    resetBtn.addEventListener("click", function () { reset(); render();
      setStatus(s.status, "Graph reset. The cycle is back.");
    });
    var rg = radiogroup("Active object", [
      { value: "R", label: "root" },
      { value: "A", label: "A" },
      { value: "B", label: "B" },
      { value: "C", label: "C" }
    ], function (v) { active = v; render(); });
    s.controls.append(group([gcBtn, resetBtn]), group([rg.el], true));

    var st = { statAlive: statBox(" alive"), statColl: statBox(" collected"),
      statSel: statBox(" selected status") };
    s.stats.append(st.statAlive.wrap, st.statColl.wrap, st.statSel.wrap);
    s.legend.append(
      legendItem({ background: cssVar("--bg") }, "Reachable object"),
      legendItem({ background: hexA(cssVar("--path"), 0.4) }, "Unreachable object"),
      legendItem({ background: cssVar("--goal") }, "Marked during sweep"));
    mount.appendChild(s.fig);
    render();
  }

  /* ==================================================================== *
   *  Figure 5 — the specialising adaptive interpreter                      *
   * ==================================================================== */
  function specialiseDemo(mount, config) {
    var s = makeCanvas({ title: "The specialising adaptive interpreter",
      help: "An interactive figure. The Step button runs one iteration of the " +
        "synthetic loop, incrementing the execution counter on the BINARY_OP " +
        "instruction; when the counter reaches eight the opcode specialises " +
        "into BINARY_OP_ADD_INT, and subsequent executions run the specialised " +
        "form. Run completes the remaining iterations; Reset returns to the " +
        "generic form.",
      status: "After enough executions the generic opcode is replaced by a specialised one.",
      caption: config.caption });
    var THRESHOLD = 8, N = 16, count = 0, specialised = false;
    var timeline = []; /* per iteration: { count, specialised } */
    function reset() { count = 0; specialised = false; timeline = []; }
    function step() {
      if (count >= N) return false;
      count++;
      if (!specialised && count >= THRESHOLD) specialised = true;
      timeline.push({ count: count, specialised: specialised });
      return true;
    }
    function render() {
      var ctx = s.ctx;
      clearBg(ctx);
      var L = 28, R = LW - 14, T = 30, B = LH - 30;
      ctx.fillStyle = cssVar("--ink"); ctx.font = "700 10px ui-mono, monospace";
      ctx.fillText("BINARY_OP" + (specialised ? "_ADD_INT" : ""), L, 22);
      ctx.fillStyle = cssVar("--ink-soft"); ctx.font = "9px ui-sans-serif, sans-serif";
      ctx.fillText("execution count " + count + " of " + N + " (threshold " + THRESHOLD + ")", L, LH - 14);
      /* draw counter bar */
      var barW = R - L, barH = 14;
      rect(ctx, L, T, barW, barH, cssVar("--bg"), cssVar("--rule"), 1.4);
      var c2 = clamp(count / N, 0, 1);
      ctx.fillStyle = specialised ? cssVar("--goal") : cssVar("--accent");
      ctx.fillRect(L + 0.5, T + 0.5, barW * c2 - 1, barH - 1);
      /* threshold mark */
      var thrX = L + barW * (THRESHOLD / N);
      ctx.strokeStyle = cssVar("--ink"); ctx.lineWidth = 1.6; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(thrX, T - 3); ctx.lineTo(thrX, T + barH + 3); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssVar("--ink"); ctx.font = "9px ui-sans-serif, sans-serif";
      ctx.fillText("specialisation", thrX + 4, T - 6);
      /* timeline as small per-iteration bars below */
      var tx = L, ty = T + 30, tW = (R - L) / N, tH = 26;
      for (var i = 0; i < timeline.length; i++) {
        var t = timeline[i];
        ctx.fillStyle = t.specialised ? cssVar("--goal") : cssVar("--accent");
        ctx.fillRect(tx + i * tW + 1, ty, tW - 2, tH * (t.specialised ? 0.65 : 1));
        if (t.specialised) {
          /* a non-colour cue: a small dot above the specialised bars */
          dot2(ctx, { x: tx + i * tW + tW / 2, y: ty - 5 }, 2, cssVar("--ink"));
        }
      }
      ctx.fillStyle = cssVar("--ink-soft"); ctx.font = "9px ui-sans-serif, sans-serif";
      ctx.fillText("per-iteration cost (specialised iterations cheaper)", L, ty + tH + 12);
      st.statCount.set(count + " / " + N);
      st.statSpec.set(specialised ? "BINARY_OP_ADD_INT" : "BINARY_OP");
      st.statSaved.set(specialised ? Math.max(0, count - THRESHOLD + 1) + " of " + (count) : "0");
      s.desc.textContent = "Execution count " + count + " of " + N +
        ". The opcode is currently " + (specialised ? "BINARY_OP_ADD_INT, the integer-specialised form."
        : "the generic BINARY_OP; it will specialise after " + (THRESHOLD - count) + " more executions.");
    }
    var announce = debounce(function () {
      setStatus(s.status, "Count " + count + ". " + (specialised ?
        "Specialised opcode in use." : "Still using the generic opcode."));
    }, 320);

    var stepBtn = btn("btn btn-primary", "Step");
    var runBtn = btn("btn", "Run");
    var resetBtn = btn("btn", "Reset");
    stepBtn.addEventListener("click", function () { if (step()) { render(); announce(); } });
    runBtn.addEventListener("click", function () { while (step()) {} render();
      setStatus(s.status, "Loop complete. The opcode specialised at iteration " + THRESHOLD + ".", "win");
    });
    resetBtn.addEventListener("click", function () { reset(); render();
      setStatus(s.status, "Reset to the generic opcode."); });
    s.controls.append(group([stepBtn, runBtn, resetBtn]));

    s.canvas.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { stepBtn.click(); e.preventDefault(); }
    });

    var st = { statCount: statBox(" executions"), statSpec: statBox(" current opcode"),
      statSaved: statBox(" specialised") };
    s.stats.append(st.statCount.wrap, st.statSpec.wrap, st.statSaved.wrap);
    s.legend.append(
      legendItem({ background: cssVar("--accent") }, "Generic opcode"),
      legendItem({ background: cssVar("--goal") }, "Specialised opcode (with dot)"));
    reset(); mount.appendChild(s.fig); render();
  }

  /* ==================================================================== *
   *  Figure 6 — frames and the call stack                                  *
   * ==================================================================== */
  function callStackDemo(mount, config) {
    var s = makeCanvas({ title: "Frames and the call stack",
      help: "An interactive figure. Step executes the next event in a small " +
        "trace of function calls and returns; the call stack grows on each " +
        "call and shrinks on each return. Reset returns to the empty stack. " +
        "Press Tab to leave the figure.",
      status: "Each call pushes a frame; each return pops the top frame.",
      caption: config.caption });
    var events = [
      { kind: "call",   name: "main()" },
      { kind: "call",   name: "outer(3)" },
      { kind: "call",   name: "inner('x')" },
      { kind: "call",   name: "log('inner started')" },
      { kind: "return", name: "log" },
      { kind: "return", name: "inner" },
      { kind: "return", name: "outer" },
      { kind: "return", name: "main" }
    ];
    var pc = 0;
    var stack = [];
    function reset() { pc = 0; stack = []; }
    function step() {
      if (pc >= events.length) return false;
      var e = events[pc];
      if (e.kind === "call") stack.push(e.name);
      else stack.pop();
      pc++; return true;
    }
    function render() {
      var ctx = s.ctx;
      clearBg(ctx);
      var L = 30, R = LW - 14, frameH = 22;
      ctx.fillStyle = cssVar("--ink"); ctx.font = "700 9px ui-sans-serif, sans-serif";
      ctx.fillText("Call stack (top first)", L, 18);
      if (stack.length === 0) {
        ctx.fillStyle = cssVar("--ink-soft"); ctx.font = "10px ui-mono, monospace";
        ctx.fillText("(empty)", L, 40);
      }
      for (var i = stack.length - 1; i >= 0; i--) {
        var y = 30 + (stack.length - 1 - i) * (frameH + 4);
        var top = i === stack.length - 1;
        rect(ctx, L, y, R - L, frameH, top ? cssVar("--bg") : cssVar("--bg-sunk"),
          top ? cssVar("--accent") : cssVar("--rule"), top ? 2.2 : 1.4);
        ctx.fillStyle = cssVar("--ink"); ctx.font = "10px ui-mono, monospace";
        ctx.fillText((i + 1) + ". " + stack[i] + (top ? "   ← active frame" : ""), L + 8, y + 15);
      }
      /* next event annotation */
      ctx.fillStyle = cssVar("--ink-soft"); ctx.font = "9px ui-sans-serif, sans-serif";
      var nx = pc < events.length ? "next: " + (events[pc].kind === "call" ? "call " : "return ") +
        events[pc].name : "trace complete";
      ctx.fillText(nx, L, LH - 14);
      st.statDepth.set(String(stack.length));
      st.statPC.set(pc + " of " + events.length);
      st.statTop.set(stack.length ? stack[stack.length - 1] : "—");
      s.desc.textContent = "After " + pc + " of " + events.length + " events, " +
        "the call stack holds " + stack.length + " frame" + (stack.length === 1 ? "" : "s") +
        (stack.length ? "; the top is " + stack[stack.length - 1] : "") + ".";
    }
    var announce = debounce(function () {
      setStatus(s.status, "Step " + pc + " of " + events.length + ". Stack depth " + stack.length +
        (stack.length ? "; top is " + stack[stack.length - 1] : "") + ".");
    }, 320);

    var stepBtn = btn("btn btn-primary", "Step");
    var resetBtn = btn("btn", "Reset");
    stepBtn.addEventListener("click", function () { if (step()) { render(); announce(); } });
    resetBtn.addEventListener("click", function () { reset(); render();
      setStatus(s.status, "Reset to an empty call stack."); });
    s.controls.append(group([stepBtn, resetBtn]));

    s.canvas.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { stepBtn.click(); e.preventDefault(); }
    });

    var st = { statDepth: statBox(" frames on the stack"), statPC: statBox(" events"),
      statTop: statBox(" active frame") };
    s.stats.append(st.statPC.wrap, st.statDepth.wrap, st.statTop.wrap);
    s.legend.append(
      legendItem({ background: cssVar("--bg") }, "Active (top) frame"),
      legendItem({ background: cssVar("--bg-sunk") }, "Caller frames"));
    reset(); mount.appendChild(s.fig); render();
  }

  /* ---- reading progress bar ------------------------------------------ */
  function initProgress(barId) {
    var bar = document.getElementById(barId);
    if (!bar) return;
    function upd() {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      bar.style.width = (max <= 0 ? 0 : clamp(h.scrollTop / max, 0, 1) * 100) + "%";
    }
    global.addEventListener("scroll", upd, { passive: true });
    global.addEventListener("resize", upd);
    upd();
  }
  function run(config, fn) {
    var mount = typeof config.mount === "string"
      ? document.querySelector(config.mount) : config.mount;
    if (mount) fn(mount, config);
  }
  global.Bytecode = {
    listing: function (c) { run(c, listingDemo); },
    valueStack: function (c) { run(c, valueStackDemo); },
    refcount: function (c) { run(c, refcountDemo); },
    gc: function (c) { run(c, gcDemo); },
    specialise: function (c) { run(c, specialiseDemo); },
    callStack: function (c) { run(c, callStackDemo); },
    initProgress: initProgress
  };
})(window);
