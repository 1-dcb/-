/* ===================================================================
   Argos 翻译工作台 — 前端脚本
   模块一: 文本翻译（保持原有逻辑）
   模块二: Transformer 透视镜（9 步完整可视化）
   =================================================================== */

// ── DOM 引用 ──────────────────────────────────────────────────────
const sourceLang = document.querySelector("#sourceLang");
const targetLang = document.querySelector("#targetLang");
const labSourceLang = document.querySelector("#labSourceLang");
const labTargetLang = document.querySelector("#labTargetLang");
const inputText = document.querySelector("#inputText");
const outputText = document.querySelector("#outputText");
const inputCount = document.querySelector("#inputCount");
const statusPill = document.querySelector("#statusPill");
const statusText = document.querySelector("#statusText");
const engineName = document.querySelector("#engineName");
const languageCount = document.querySelector("#languageCount");
const setupHint = document.querySelector("#setupHint");
const engineMeta = document.querySelector("#engineMeta");
const translateBtn = document.querySelector("#translateBtn");
const sampleBtn = document.querySelector("#sampleBtn");
const clearBtn = document.querySelector("#clearBtn");
const swapBtn = document.querySelector("#swapBtn");
const copyBtn = document.querySelector("#copyBtn");
const labInput = document.querySelector("#labInput");
const labCount = document.querySelector("#labCount");
const labMeter = document.querySelector("#labMeter");
const analyzeBtn = document.querySelector("#analyzeBtn");
const labSwapBtn = document.querySelector("#labSwapBtn");

// 可视化 DOM 引用
const stageNavDots = document.querySelector("#stageNavDots");
const autoPlayBtn = document.querySelector("#autoPlayBtn");
const tokenRail = document.querySelector("#tokenRail");
const peSimple = document.querySelector("#peSimple");
const embeddingMatrix = document.querySelector("#embeddingMatrix");
const combinedMatrix = document.querySelector("#combinedMatrix");
const qkvGrid = document.querySelector("#qkvGrid");
const multiHeadGrid = document.querySelector("#multiHeadGrid");
const multiHeadNote = document.querySelector("#multiHeadNote");
const ffnFlow = document.querySelector("#ffnFlow");
const residualDiagram = document.querySelector("#residualDiagram");
const layerSlider = document.querySelector("#layerSlider");
const layerLabel = document.querySelector("#layerLabel");
const layerMiniGrid = document.querySelector("#layerMiniGrid");
const decoderGenerated = document.querySelector("#decoderGenerated");
const decoderCandidates = document.querySelector("#decoderCandidates");
const decoderStepBtn = document.querySelector("#decoderStepBtn");
const decoderAutoBtn = document.querySelector("#decoderAutoBtn");
const decoderResetBtn = document.querySelector("#decoderResetBtn");
const decoderResult = document.querySelector("#decoderResult");
const decoderBeam = document.querySelector("#decoderBeam");
const modelInfoPanel = document.querySelector("#modelInfoPanel");

// ── 常量 ──────────────────────────────────────────────────────────
const samples = ["Hello world", "Good morning", "AI tools", "你好世界"];
const featureNames = ["语义", "顺序", "上下文", "风格"];
const LENS_CHAR_LIMIT = 100;
const N_HEADS = 4;
const N_LAYERS = 6;
const FFN_EXPAND = 4;

const HEAD_COLORS = [
  { name: "Teal", base: "#007f73", css: "var(--teal)" },
  { name: "Coral", base: "#e36c4f", css: "var(--coral)" },
  { name: "Violet", base: "#6657c7", css: "var(--violet)" },
  { name: "Amber", base: "#b98715", css: "var(--amber)" },
];

const HEAD_BIASES = [
  { label: "邻近词 (局部)", bias: (i, j, len) => -Math.abs(i - j) * 1.2 },
  { label: "首词 (全局)", bias: (i, j) => (j === 0 ? 1.8 : 0) },
  { label: "自身 (语义)", bias: (i, j) => (i === j ? 2.5 : -0.5) },
  { label: "均匀 (汇总)", bias: () => 0 },
];

const languageNames = {
  English: "英语", Chinese: "中文", Spanish: "西班牙语",
  French: "法语", German: "德语", Japanese: "日语", Korean: "韩语",
};

// paper section references for each stage
const PAPER_REF = {
  1: "§3.5 & §3.1",
  2: "§3.4",
  3: "§3.2.2",
  4: "§3.2.1 & §3.2.2",
  5: "§3.3",
  6: "§3.1",
  7: "§3.1",
  8: "§3.1 & inference",
  9: "Real model",
};

// ── 工具函数 ──────────────────────────────────────────────────────
function clampUnit(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}
function safeWeight(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
function escapeHtml(v) {
  return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function hashToken(token, seed) {
  return Array.from(token).reduce((s, c, i) => s + (c.codePointAt(0) || 0) * (i + 1 + seed), seed * 131 + token.length * 17);
}

// ── 确定性伪随机矩阵生成 ─────────────────────────────────────────
function seededRandom(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function seededMatrix(seed, rows, cols) {
  const rng = seededRandom(seed);
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rng() * 2 - 1)
  );
}

function matVecMul(mat, vec) {
  return mat[0].map((_, ci) =>
    clampUnit(mat.reduce((sum, row, ri) => sum + row[ci] * clampUnit(vec[ri]), 0))
  );
}

// ── Token 化 ──────────────────────────────────────────────────────
function tokenize(text) {
  const trimmed = Array.from(text.trim()).slice(0, LENS_CHAR_LIMIT).join("");
  if (!trimmed) return ["Hello"];
  if (trimmed.includes(" ")) return trimmed.split(/\s+/).filter(Boolean).slice(0, LENS_CHAR_LIMIT);
  if (/^[A-Za-z]+$/.test(trimmed)) return [trimmed];
  return Array.from(trimmed);
}

// ── 步骤 ①: 位置编码 ─────────────────────────────────────────────
function buildPositionalEncoding(numTokens, dims = 32) {
  const pe = [];
  for (let pos = 0; pos < numTokens; pos++) {
    const row = [];
    for (let i = 0; i < dims; i++) {
      const angle = pos / Math.pow(10000, (2 * Math.floor(i / 2)) / dims);
      row.push(i % 2 === 0 ? Math.sin(angle) : Math.cos(angle));
    }
    pe.push(row);
  }
  return pe;
}

function renderPESimple(tokens, pe) {
  if (!peSimple) return;
  const showDims = 6; // sin0, cos0, sin1, cos1, sin2, cos2
  const dimLabels = ['sin₀', 'cos₀', 'sin₁', 'cos₁', 'sin₂', 'cos₂'];
  const dimNotes = ['波最长\n区分头尾', '波最长\n区分头尾', '波中等\n区分前后段', '波中等\n区分前后段', '波最短\n区分相邻', '波最短\n区分相邻'];

  peSimple.innerHTML = `
    <div class="pe-simple-header">
      <span>token</span>
      ${dimLabels.map((l, i) => `<span class="pe-dim-label" title="${dimNotes[i]}">${l}<small>${dimNotes[i].split('\n')[0]}</small></span>`).join("")}
    </div>
    ${tokens.map((t, pos) => `
      <div class="pe-simple-row">
        <span class="pe-token-label">${escapeHtml(t)} <em>pos${pos}</em></span>
        ${Array.from({ length: showDims }, (_, d) => {
          const v = pe[pos] ? pe[pos][d] : 0;
          const abs = Math.abs(v);
          const bg = v >= 0 ? `rgba(0,127,115,${(0.15 + abs * 0.8).toFixed(2)})` : `rgba(227,108,79,${(0.15 + abs * 0.8).toFixed(2)})`;
          return `<span class="pe-cell" style="background:${bg}"><b>${v.toFixed(2)}</b><i style="height:${Math.round(abs * 100)}%"></i></span>`;
        }).join("")}
      </div>
    `).join("")}
    <div class="pe-simple-footer">
      低频（左两列）→ 粗粒度位置（头/中/尾）&nbsp;&nbsp;|&nbsp;&nbsp;高频（右两列）→ 细粒度位置（相邻词区分）
    </div>
  `;
}

// ── 词嵌入生成 ────────────────────────────────────────────────────
function vectorFor(token, index, size = 4) {
  const codes = Array.from(token).map(c => c.codePointAt(0) || 0);
  const avg = codes.reduce((s, c) => s + c, 0) / Math.max(1, codes.length);
  const spread = codes.reduce((s, c) => s + Math.abs(c - avg), 0) / Math.max(1, codes.length);
  return Array.from({ length: size }, (_, fi) => {
    const raw = (hashToken(token, index * 11 + fi * 17) + avg * (fi + 1) + spread) % 201;
    const posSignal = Math.sin((index + 1) * (fi + 1)) * 0.18;
    return clampUnit((raw - 100) / 100 + posSignal);
  });
}

// ── 步骤 ②: 嵌入 + PE 相加 ────────────────────────────────────────
function renderEmbeddings(tokens, embeddings) {
  if (!embeddingMatrix) return;
  embeddingMatrix.innerHTML = `
    <div class="matrix-head">
      <span>词元</span>
      ${featureNames.map(n => `<span>${n}</span>`).join("")}
    </div>
    ${tokens.map((t, i) => `
      <div class="matrix-row">
        <strong>${escapeHtml(t)}</strong>
        ${embeddings[i].map(vectorCell).join("")}
      </div>
    `).join("")}
  `;
}

function vectorCell(value) {
  const clean = clampUnit(value);
  const intensity = Math.round(Math.abs(clean) * 72 + 18);
  const color = clean >= 0
    ? `rgba(0, 127, 115, ${intensity / 100})`
    : `rgba(227, 108, 79, ${intensity / 100})`;
  return `<span class="vector-cell" style="background:${color}">${clean.toFixed(2)}</span>`;
}

function renderCombinedMatrix(tokens, embeddings, pe4) {
  if (!combinedMatrix) return;
  const rows = tokens.map((t, i) => {
    const emb = embeddings[i].slice(0, 4);
    const p = pe4[i] || [0, 0, 0, 0];
    const combined = emb.map((e, j) => clampUnit(e + p[j]));
    return { token: t, emb, pe: p, comb: combined };
  });
  combinedMatrix.innerHTML = `
    <div class="combined-header">
      <span></span><span class="col-group" style="grid-column:span 4">词嵌入 (语义)</span>
      <span class="plus-col">+</span>
      <span class="col-group" style="grid-column:span 4">位置编码 (位置)</span>
      <span class="plus-col">=</span>
      <span class="col-group" style="grid-column:span 4">Encoder 输入</span>
    </div>
    ${rows.map(r => `
      <div class="combined-row">
        <strong>${escapeHtml(r.token)}</strong>
        ${r.emb.map(vectorCell).join("")}
        <span class="plus-col">+</span>
        ${r.pe.map(vectorCell).join("")}
        <span class="plus-col">=</span>
        ${r.comb.map(vectorCell).join("")}
      </div>
    `).join("")}
  `;
}

// ── 步骤 ③: 多头 Q/K/V ────────────────────────────────────────────
function projectQkvMulti(vector, headIndex) {
  const seed = headIndex * 17 + 3;
  const wq = seededMatrix(seed, 4, 3);
  const wk = seededMatrix(seed + 1, 4, 3);
  const wv = seededMatrix(seed + 2, 4, 3);
  return {
    q: matVecMul(wq, vector).map(clampUnit),
    k: matVecMul(wk, vector).map(clampUnit),
    v: matVecMul(wv, vector).map(clampUnit),
  };
}

function vectorBars(values, colorVar) {
  return values.map(v => {
    const clean = clampUnit(v);
    const width = Math.max(6, Math.abs(clean) * 100);
    const side = clean >= 0 ? "positive" : "negative";
    return `<div class="bar-row ${side}">
      <span>${clean.toFixed(2)}</span>
      <i><b style="width:${width}%;background:var(${colorVar || '--teal'})"></b></i>
    </div>`;
  }).join("");
}

function compactBars(values, colorVar) {
  // Ultra-compact: just tiny colored blocks, no text
  return values.map(v => {
    const clean = clampUnit(v);
    const h = Math.round(Math.abs(clean) * 100);
    const hue = clean >= 0 ? 'teal' : 'coral';
    return `<i class="cbar ${hue}" style="height:${Math.max(4, h)}%"></i>`;
  }).join("");
}

function renderMultiHeadQKV(tokens, embeddings) {
  if (!multiHeadGrid || !multiHeadNote) return;
  multiHeadGrid.innerHTML = HEAD_COLORS.map((hc, hi) => {
    const qkvList = embeddings.map(v => projectQkvMulti(v, hi));
    return `
      <div class="multihead-card" style="border-top:3px solid ${hc.base}">
        <div class="multihead-label" style="color:${hc.base}">头 ${hi} · ${HEAD_BIASES[hi].label}</div>
        <div class="mh-table">
          <div class="mh-header"><span></span><span>Q</span><span>K</span><span>V</span></div>
          ${qkvList.map((qkv, ti) => `
            <div class="mh-row">
              <span class="mh-token" title="${escapeHtml(tokens[ti])}">${escapeHtml(tokens[ti])}</span>
              <span class="mh-bars">${compactBars(qkv.q, hc.css)}</span>
              <span class="mh-bars">${compactBars(qkv.k, hc.css)}</span>
              <span class="mh-bars">${compactBars(qkv.v, hc.css)}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
  multiHeadNote.textContent = "每个头用不同的 W^Q, W^K, W^V 矩阵做线性投影。绿色=正值，橙色=负值，柱越高绝对值越大。4 个头产生 4 种不同的 Q/K/V 模式。";
}

// ── 步骤 ④: 多头注意力 ────────────────────────────────────────────
function softmax(values) {
  const clean = values.map(v => (Number.isFinite(v) ? v : 0));
  const max = Math.max(...clean);
  if (!Number.isFinite(max)) return clean.map(() => 1 / Math.max(1, clean.length));
  const exps = clean.map(v => Math.exp(v - max));
  const total = exps.reduce((s, v) => s + v, 0);
  if (!Number.isFinite(total) || total === 0) return clean.map(() => 1 / Math.max(1, clean.length));
  return exps.map(v => safeWeight(v / total));
}

function dot(a, b) {
  return a.reduce((s, v, i) => s + clampUnit(v) * clampUnit(b[i]), 0);
}

function buildMultiHeadAttention(embeddings) {
  return HEAD_COLORS.map((_, hi) => {
    const qkvList = embeddings.map(v => projectQkvMulti(v, hi));
    const queries = qkvList.map(x => x.q);
    const keys = qkvList.map(x => x.k);
    const values = qkvList.map(x => x.v);
    const biasFn = HEAD_BIASES[hi].bias;
    const n = queries.length;
    const rawAttention = queries.map((q, qi) => {
      const scores = keys.map((k, ki) => {
        const raw = dot(q, k) / Math.sqrt(3);
        return raw + biasFn(qi, ki, n) * 0.4;
      });
      return softmax(scores);
    });
    const contexts = rawAttention.map((weights, qi) =>
      values[0].map((_, fi) =>
        clampUnit(weights.reduce((s, w, vi) => s + safeWeight(w) * clampUnit(values[vi][fi]), 0))
      )
    );
    return { attention: rawAttention, contexts };
  });
}

function renderMultiHeadAttention(tokens, headData, activeHead) {
  const hd = headData || [];
  // mini heatmaps for all heads
  const miniGrid = document.querySelector("#attentionMiniGrid");
  if (miniGrid) {
    miniGrid.innerHTML = hd.map((h, hi) => {
      const isActive = hi === (activeHead || 0);
      return `
        <div class="mini-heatmap ${isActive ? 'active' : ''}" data-head="${hi}">
          <div class="mini-heat-label" style="color:${HEAD_COLORS[hi].base}">
            头 ${hi} · ${HEAD_BIASES[hi].label}
          </div>
          <div class="mini-heat-grid" style="grid-template-columns:repeat(${tokens.length}, 1fr)">
            ${h.attention.map((row, ri) =>
              row.map((w, ci) => {
                const opacity = Math.max(0.12, safeWeight(w));
                return `<span class="mini-heat-cell" style="background:${HEAD_COLORS[hi].base};opacity:${opacity.toFixed(3)}" title="${tokens[ri]}→${tokens[ci]}: ${Math.round(w*100)}%"></span>`;
              }).join("")
            ).join("")}
          </div>
        </div>
      `;
    }).join("");
    // click handler
    miniGrid.querySelectorAll(".mini-heatmap").forEach(el => {
      el.addEventListener("click", () => {
        const hi = parseInt(el.dataset.head);
        renderMainHeatmap(tokens, hd, hi);
        miniGrid.querySelectorAll(".mini-heatmap").forEach(e => e.classList.remove("active"));
        el.classList.add("active");
      });
    });
  }
  // default: show head 0 in main view
  renderMainHeatmap(tokens, hd, activeHead || 0);
}

function renderMainHeatmap(tokens, hd, hi) {
  const mainHeat = document.querySelector("#attentionMainHeat");
  const contextStack = document.querySelector("#contextStack");
  if (!mainHeat || !contextStack || !hd[hi]) return;
  const { attention, contexts } = hd[hi];
  mainHeat.style.gridTemplateColumns = `82px repeat(${tokens.length}, minmax(40px, 1fr))`;
  mainHeat.innerHTML = `
    <span class="heat-label"></span>
    ${tokens.map(t => `<span class="heat-label">${escapeHtml(t)}</span>`).join("")}
    ${attention.map((row, ri) =>
      `<span class="heat-label row">${escapeHtml(tokens[ri])}</span>` +
      row.map(w => {
        const op = Math.max(0.14, safeWeight(w));
        return `<span class="heat-cell" style="background:rgba(0,127,115,${op})">${Math.round(safeWeight(w)*100)}%</span>`;
      }).join("")
    ).join("")}
  `;
  contextStack.innerHTML = tokens.map((t, i) => `
    <div class="context-row">
      <strong>${escapeHtml(t)}</strong>
      <div>${vectorBars(contexts[i])}</div>
    </div>
  `).join("");
}

// ── 步骤 ⑤: FFN ────────────────────────────────────────────────────
function renderFFN(tokens, embeddings) {
  if (!ffnFlow) return;
  const hiddenDim = 4 * FFN_EXPAND;
  ffnFlow.innerHTML = tokens.map((t, i) => {
    const input = embeddings[i];
    // simulate FFN: expand -> ReLU -> compress
    const expanded = Array.from({ length: hiddenDim }, (_, j) =>
      clampUnit(input[j % 4] * (0.5 + seededRandom(i * 31 + j)() * 1.0))
    );
    const relued = expanded.map(v => (v > 0 ? v : 0));
    const compressed = Array.from({ length: 4 }, (_, j) =>
      clampUnit(relued.slice(j * FFN_EXPAND, (j + 1) * FFN_EXPAND).reduce((s, v) => s + v, 0) / FFN_EXPAND)
    );
    return `
      <div class="ffn-row">
        <span class="ffn-token">${escapeHtml(t)}</span>
        <div class="ffn-stage ffn-input">${input.map(v => `<span class="ffn-bar" style="--ffn-v:${v.toFixed(2)}"></span>`).join("")}</div>
        <span class="ffn-arrow">→ W₁ →</span>
        <div class="ffn-stage ffn-expand">${expanded.slice(0, 8).map(v => `<span class="ffn-bar" style="--ffn-v:${v.toFixed(2)}"></span>`).join("")}<small>×${hiddenDim / 8}</small></div>
        <span class="ffn-arrow">→ ReLU →</span>
        <div class="ffn-stage ffn-relu">${relued.slice(0, 8).map(v => `<span class="ffn-bar ${v === 0 ? 'dead' : ''}" style="--ffn-v:${v.toFixed(2)}"></span>`).join("")}<small>负→0</small></div>
        <span class="ffn-arrow">→ W₂ →</span>
        <div class="ffn-stage ffn-output">${compressed.map(v => `<span class="ffn-bar" style="--ffn-v:${v.toFixed(2)}"></span>`).join("")}</div>
      </div>
    `;
  }).join("");
}

// ── 步骤 ⑥: 残差连接 ──────────────────────────────────────────────
function renderResidual(tokens) {
  if (!residualDiagram) return;
  residualDiagram.innerHTML = `
    <div class="residual-block">
      <div class="residual-flow">
        <div class="residual-node">输入 x</div>
        <div class="residual-split">
          <div class="residual-main">
            <div class="residual-node sublayer">Multi-Head Attention</div>
            <div class="residual-node sublayer">Feed-Forward Network</div>
          </div>
          <div class="residual-skip">
            <svg width="120" height="90" viewBox="0 0 120 90">
              <path d="M10,10 L110,10 L110,80 L50,80" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-dasharray="6 3" marker-end="url(#arrowhead)"/>
              <defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="var(--teal)"/></marker></defs>
            </svg>
          </div>
        </div>
        <div class="residual-node add-norm">⊕ Add & Norm</div>
        <div class="residual-node add-norm">⊕ Add & Norm</div>
        <div class="residual-node output">输出</div>
      </div>
      <p class="residual-caption">残差连接: <code>LayerNorm(x + Sublayer(x))</code> — 跳跃连接让梯度直接流过，防止深层网络退化。</p>
    </div>
  `;
}

// ── 步骤 ⑦: Encoder 层堆叠 ────────────────────────────────────────
function buildLayerAttentions(tokens, embeddings) {
  // simulate different attention patterns per layer
  return Array.from({ length: N_LAYERS }, (_, layer) => {
    const temperature = 0.3 + layer * 0.5;
    const spread = 1.0 - layer * 0.15;
    const qkvList = embeddings.map(v => projectQkvMulti(v, 0));
    const keys = qkvList.map(x => x.k);
    const n = tokens.length;
    const attn = qkvList.map((qkv, qi) => {
      const scores = keys.map((k, ki) => {
        const dist = Math.abs(qi - ki);
        const base = dot(qkv.q, k) / Math.sqrt(3);
        return base / temperature - dist * (1 - spread);
      });
      return softmax(scores);
    });
    return attn;
  });
}

function renderLayerView(tokens, layerAttentions, activeLayer) {
  if (!layerLabel) return;
  layerLabel.textContent = `第 ${activeLayer + 1} 层 / 共 ${N_LAYERS} 层`;
  if (layerSlider) layerSlider.value = activeLayer;

  const attn = layerAttentions[activeLayer];
  if (!attn) return;

  // mini grid of all layers
  if (layerMiniGrid) {
    layerMiniGrid.innerHTML = layerAttentions.map((la, li) => {
      const isActive = li === activeLayer;
      return `
        <div class="layer-mini-card ${isActive ? 'active' : ''}" data-layer="${li}">
          <div class="layer-mini-label">L${li + 1}</div>
          <div class="layer-mini-heat" style="grid-template-columns:repeat(${tokens.length}, minmax(14px, 1fr))">
            ${la.map(row => row.map(w => {
              const op = Math.max(0.1, safeWeight(w));
              return `<span style="background:rgba(0,127,115,${op.toFixed(3)})"></span>`;
            }).join("")).join("")}
          </div>
        </div>
      `;
    }).join("");
    layerMiniGrid.querySelectorAll(".layer-mini-card").forEach(el => {
      el.addEventListener("click", () => {
        const li = parseInt(el.dataset.layer);
        renderLayerView(tokens, layerAttentions, li);
      });
    });
  }

  // detailed heatmap for active layer
  const layerHeat = document.querySelector("#layerHeatDetail");
  if (layerHeat) {
    layerHeat.style.gridTemplateColumns = `72px repeat(${tokens.length}, minmax(36px, 1fr))`;
    layerHeat.innerHTML = `
      <span class="heat-label"></span>
      ${tokens.map(t => `<span class="heat-label">${escapeHtml(t)}</span>`).join("")}
      ${attn.map((row, ri) =>
        `<span class="heat-label row">${escapeHtml(tokens[ri])}</span>` +
        row.map(w => {
          const op = Math.max(0.12, safeWeight(w));
          return `<span class="heat-cell" style="background:rgba(0,127,115,${op})">${Math.round(safeWeight(w)*100)}%</span>`;
        }).join("")
      ).join("")}
    `;
  }

  const layerNote = document.querySelector("#layerNote");
  if (layerNote) {
    const notes = [
      "第 1 层: 注意力分散在相邻词上，主要捕捉局部词法关系",
      "第 2 层: 开始关注更远的词，短语结构浮现",
      "第 3 层: 注意范围进一步扩大，句法依赖开始形成",
      "第 4 层: 语义角色逐渐明确，关键词获得更多关注",
      "第 5 层: 全局语义整合，注意力集中到句子核心词",
      "第 6 层: 高度抽象的语义表示，注意力聚焦关键信息",
    ];
    layerNote.textContent = notes[activeLayer];
  }
}

// ── 步骤 ⑧: Decoder 自回归生成 ──────────────────────────────────────
let decoderState = { tokens: [], step: 0, sourceTokens: [], targetTokens: [], autoTimer: null };

function initDecoderSimulation(sourceTokens, targetTokens) {
  // targetTokens comes from the real translation (split by character for Chinese, by word for English)
  const decodedTargets = targetTokens && targetTokens.length > 0
    ? targetTokens
    : ["?", "?", "?"]; // fallback if no translation available
  decoderState = {
    tokens: ["<SOS>"],
    step: 0,
    sourceTokens,
    targetTokens: decodedTargets,
    autoTimer: null,
  };
  renderDecoderStep();
}

function renderDecoderStep() {
  if (!decoderGenerated || !decoderCandidates) return;
  const { tokens, step, sourceTokens, targetTokens } = decoderState;
  const maxSteps = targetTokens.length;

  // show generated tokens so far
  decoderGenerated.innerHTML = tokens.map((t, i) =>
    `<span class="gen-token ${i === tokens.length - 1 && step > 0 ? 'latest' : ''}" style="--delay:${i}">${escapeHtml(t)}</span>`
  ).join("");

  // dynamic candidates: the actual next token is top candidate
  const done = step >= maxSteps;
  if (done) {
    decoderCandidates.innerHTML = `<div class="cand-done">✓ 生成完成 — 共 ${maxSteps} 步</div>`;
  } else {
    const nextToken = targetTokens[step];
    // generate plausible alternatives
    const alt1 = step + 1 < maxSteps ? targetTokens[step + 1] : "<EOS>";
    const alt2 = "<EOS>";
    const candidates = [
      { token: nextToken, prob: 0.65 + Math.random() * 0.2 },
      { token: alt1, prob: 0.1 + Math.random() * 0.15 },
      { token: alt2, prob: 0.03 + Math.random() * 0.07 },
    ];
    decoderCandidates.innerHTML = candidates.map((c, i) => {
      const width = c.prob * 100;
      return `
        <div class="candidate-bar ${i === 0 ? 'top' : ''}">
          <span class="cand-token">${escapeHtml(c.token)}</span>
          <div class="cand-track"><span style="width:${width}%"></span></div>
          <span class="cand-prob">${(c.prob * 100).toFixed(0)}%</span>
        </div>
      `;
    }).join("");
  }

  // cross-attention highlight: step maps to source tokens proportionally
  if (!done && sourceTokens.length > 0) {
    const srcIdx = Math.floor((step / Math.max(1, maxSteps)) * sourceTokens.length);
    highlightSourceToken(srcIdx);
  } else if (done) {
    highlightSourceToken(-1);
  }

  if (decoderStepBtn) decoderStepBtn.disabled = done;
  if (decoderAutoBtn) decoderAutoBtn.textContent = decoderState.autoTimer ? "⏸ 停止" : (done ? "✓ 完成" : "▶ 自动播放");
}

function highlightSourceToken(idx) {
  const rail = document.querySelector("#tokenRail");
  if (!rail) return;
  rail.querySelectorAll(".token-chip").forEach((el, i) => {
    el.classList.toggle("highlighted", i === idx);
  });
}

function decoderStepForward() {
  const { step, targetTokens } = decoderState;
  if (step >= targetTokens.length) return;
  decoderState.tokens.push(targetTokens[step]);
  decoderState.step++;
  renderDecoderStep();

  // show final translation in the result area
  if (decoderState.step >= targetTokens.length) {
    const finalText = decoderState.tokens.slice(1).join(""); // remove <SOS>
    decoderResult.textContent = finalText;
    decoderBeam.innerHTML = decoderState.sourceTokens.map((t, i) =>
      `<span style="--delay:${i}">${escapeHtml(t)}</span>`
    ).join("");
    decoderBeam.dataset.mode = "complete";
  }
}

function decoderAutoToggle() {
  if (decoderState.autoTimer) {
    clearInterval(decoderState.autoTimer);
    decoderState.autoTimer = null;
    renderDecoderStep();
    return;
  }
  if (decoderState.step >= decoderState.targetTokens.length) {
    // reset if already done
    decoderState.tokens = ["<SOS>"];
    decoderState.step = 0;
  }
  decoderState.autoTimer = setInterval(() => {
    if (decoderState.step >= decoderState.targetTokens.length) {
      clearInterval(decoderState.autoTimer);
      decoderState.autoTimer = null;
      renderDecoderStep();
      return;
    }
    decoderStepForward();
  }, 800);
}

function decoderReset() {
  if (decoderState.autoTimer) {
    clearInterval(decoderState.autoTimer);
    decoderState.autoTimer = null;
  }
  decoderState.tokens = ["<SOS>"];
  decoderState.step = 0;
  highlightSourceToken(-1);
  renderDecoderStep();
  decoderResult.textContent = "等待可视化结果";
  decoderBeam.innerHTML = "";
}

// ── 步骤 ⑨: 模型信息 ──────────────────────────────────────────────
function renderModelInfo(data) {
  if (!modelInfoPanel) return;
  const mode = data?.mode || "demo";
  const engine = data?.engine || "Demo mode";
  modelInfoPanel.innerHTML = `
    <div class="model-info-card ${mode === 'offline' ? 'real' : 'demo'}">
      <div class="model-info-header">
        <span>${mode === 'offline' ? '真实模型' : '演示模式'}</span>
        <span>${engine}</span>
      </div>
      <div class="model-info-body">
        <div class="info-row"><span>架构</span><strong>OpenNMT Transformer (Encoder-Decoder)</strong></div>
        <div class="info-row"><span>层数</span><strong>6 Encoder + 6 Decoder</strong></div>
        <div class="info-row"><span>注意力头</span><strong>8 头</strong></div>
        <div class="info-row"><span>模型维度</span><strong>d_model=512, d_ff=2048</strong></div>
        <div class="info-row"><span>参数量</span><strong>~82M</strong></div>
        <div class="info-row"><span>模型文件</span><strong>model.bin (82MB)</strong></div>
      </div>
      <p class="model-info-note">
        ⚡ 上方可视化展示的是<strong>概念模拟</strong>（帮助你理解数学原理）。
        实际翻译由<strong>CTranslate2</strong>引擎运行真实Transformer模型完成。
      </p>
    </div>
  `;
}

// ── 步骤导航条 ──────────────────────────────────────────────────────
function buildStageNav(currentStage) {
  if (!stageNavDots) return;
  stageNavDots.innerHTML = Array.from({ length: 9 }, (_, i) => {
    const stage = i + 1;
    const active = stage === currentStage ? " active" : "";
    const done = stage < currentStage ? " done" : "";
    return `<span class="stage-dot${active}${done}" data-stage="${stage}" title="步骤 ${stage}: 对应论文 ${PAPER_REF[stage] || ''}">${stage}</span>`;
  }).join("");
  stageNavDots.querySelectorAll(".stage-dot").forEach(dot => {
    dot.addEventListener("click", () => {
      const s = parseInt(dot.dataset.stage);
      scrollToStage(s);
    });
  });
}

function scrollToStage(stage) {
  const ids = ["stage1", "stage2", "stage3", "stage4", "stage5", "stage6", "stage7", "stage8", "stage9"];
  const el = document.getElementById(ids[stage - 1]);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── 核心: 构建 Transformer 模型数据 ─────────────────────────────────
function buildTransformerModel(text) {
  const tokens = tokenize(text);
  const pe = buildPositionalEncoding(tokens.length, 32);
  const pe4 = pe.map(row => [row[0], row[2], row[4], row[6]]);
  const embeddings = tokens.map((token, index) => vectorFor(token, index));
  const multiHeadData = buildMultiHeadAttention(embeddings);
  const layerAttentions = buildLayerAttentions(tokens, embeddings);

  return { tokens, pe, pe4, embeddings, multiHeadData, layerAttentions };
}

// ── 主可视化函数 ──────────────────────────────────────────────────
function visualizeTransformerStage(model, stage, translationData) {
  buildStageNav(stage);

  switch (stage) {
    case 1:
      renderPESimple(model.tokens, model.pe);
      break;
    case 2:
      renderEmbeddings(model.tokens, model.embeddings);
      renderCombinedMatrix(model.tokens, model.embeddings, model.pe4);
      break;
    case 3:
      renderMultiHeadQKV(model.tokens, model.embeddings);
      break;
    case 4:
      renderMultiHeadAttention(model.tokens, model.multiHeadData, 0);
      break;
    case 5:
      renderFFN(model.tokens, model.embeddings);
      break;
    case 6:
      renderResidual(model.tokens);
      break;
    case 7:
      renderLayerView(model.tokens, model.layerAttentions, 0);
      break;
    case 8:
      initDecoderSimulation(model.tokens, model.embeddings);
      break;
    case 9:
      renderModelInfo(translationData);
      break;
  }
}

async function visualizeTransformer() {
  const text = labInput.value.trim() || "Hello";
  setAnalyzeBusy(true);

  const model = buildTransformerModel(text);
  // render tokens in step 1's area
  renderTokens(model.tokens);

  // render all stages 1-7
  for (let s = 1; s <= 7; s++) {
    visualizeTransformerStage(model, s, null);
  }

  // step 8+9: try real translation first, then init decoder with actual result
  let targetTokens = [];
  let translationData = null;
  try {
    translationData = await requestTranslation(text, labSourceLang.value, labTargetLang.value);
    // tokenize the translation result for decoder simulation
    const rawResult = translationData.translatedText || "";
    targetTokens = rawResult.includes(" ")
      ? rawResult.split(/\s+/).filter(Boolean)
      : Array.from(rawResult);
    if (targetTokens.length === 0) targetTokens = ["?"];
  } catch (error) {
    targetTokens = ["?", "?"];
  }

  // init decoder with actual translation tokens
  initDecoderSimulation(model.tokens, targetTokens);

  // show real translation in result area
  if (translationData) {
    decoderResult.textContent = translationData.translatedText || "翻译结果";
    decoderBeam.innerHTML = model.tokens.map((t, i) => `<span style="--delay:${i}">${escapeHtml(t)}</span>`).join("");
    decoderBeam.dataset.mode = translationData.mode || "complete";
    renderModelInfo(translationData);
  } else {
    renderModelInfo({ mode: "demo", engine: "Demo mode" });
  }

  setAnalyzeBusy(false);
  buildStageNav(1);
  const lensBoard = document.querySelector(".lens-board");
  if (lensBoard) lensBoard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTokens(tokens) {
  if (!tokenRail) return;
  tokenRail.innerHTML = tokens.map((token, index) => `
    <div class="token-chip">
      <span>${escapeHtml(token)}</span>
      <small>位置 ${index + 1}</small>
    </div>
  `).join("");
}

// ── 自动播放 ────────────────────────────────────────────────────────
let autoPlayTimer = null;
let autoPlayStage = 1;

function startAutoPlay(model) {
  if (autoPlayTimer) {
    clearInterval(autoPlayTimer);
    autoPlayTimer = null;
    if (autoPlayBtn) autoPlayBtn.textContent = "自动演示";
    return;
  }
  autoPlayStage = 1;
  if (autoPlayBtn) autoPlayBtn.textContent = "停止演示";
  autoPlayTimer = setInterval(() => {
    if (autoPlayStage > 9) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
      if (autoPlayBtn) autoPlayBtn.textContent = "自动演示";
      return;
    }
    visualizeTransformerStage(model, autoPlayStage, null);
    scrollToStage(autoPlayStage);
    autoPlayStage++;
  }, 2200);
}

// ── 模块一: 翻译（保持原有）───────────────────────────────────────
function fillLanguages(languages) {
  const options = languages.map(language => {
    const displayName = languageNames[language.name] || language.name;
    return `<option value="${language.code}">${displayName} - ${language.code}</option>`;
  }).join("");
  [sourceLang, targetLang, labSourceLang, labTargetLang].forEach(select => {
    select.innerHTML = options;
  });
  sourceLang.value = languages.some(l => l.code === "en") ? "en" : languages[0]?.code;
  targetLang.value = languages.some(l => l.code === "zh") ? "zh" : languages[1]?.code || sourceLang.value;
  labSourceLang.value = sourceLang.value;
  labTargetLang.value = targetLang.value;
}

function updateCount() { inputCount.textContent = `${inputText.value.length} 个字符`; }
function updateLabCount() {
  const count = Array.from(labInput.value).length;
  labCount.textContent = `${count} / ${LENS_CHAR_LIMIT}`;
  labMeter.style.width = `${Math.min(100, (count / LENS_CHAR_LIMIT) * 100)}%`;
}
function setBusy(b) { translateBtn.disabled = b; translateBtn.textContent = b ? "翻译中" : "翻译"; }
function setAnalyzeBusy(b) { analyzeBtn.disabled = b; analyzeBtn.textContent = b ? "计算中" : "可视化"; }

async function loadStatus() {
  const response = await fetch("/api/status");
  const data = await response.json();
  fillLanguages(data.languages);
  statusPill.dataset.ready = String(data.ready);
  statusText.textContent = data.ready ? "离线引擎就绪" : "演示模式";
  engineName.textContent = data.engine === "Argos Translate" ? "Argos 离线翻译" : data.engine;
  languageCount.textContent = data.languages.length;
  setupHint.textContent = data.ready ? "已检测到本地 Argos 语言包，可以进行离线翻译。" : data.detail;
  engineMeta.textContent = data.ready ? "Argos 运行时已启用" : "未安装模型时会显示演示结果";
}

async function requestTranslation(text, source, target) {
  const response = await fetch("/api/translate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source, target }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "翻译失败。");
  return data;
}

async function translateCurrentText() {
  const text = inputText.value.trim();
  if (!text) {
    outputText.textContent = "请在左侧输入要翻译的文本。";
    return;
  }
  if (text.length > 5000) {
    outputText.textContent = "文本过长，请控制在 5000 字符以内。";
    return;
  }
  setBusy(true);
  outputText.textContent = "翻译引擎正在处理...";
  try {
    const data = await requestTranslation(text, sourceLang.value, targetLang.value);
    outputText.textContent = data.translatedText;
    outputText.classList.add("translate-success");
    setTimeout(() => outputText.classList.remove("translate-success"), 900);
    engineMeta.textContent = `${data.engine === "Argos Translate" ? "Argos 离线翻译" : data.engine} • ${data.elapsedMs} ms`;
    if (data.detail) setupHint.textContent = data.detail;
  } catch (error) {
    outputText.textContent = `翻译失败：${error.message || "请检查网络连接后重试。"}`;
    engineMeta.textContent = "请求失败，可重试";
  } finally { setBusy(false); }
}

// ── 事件监听 ────────────────────────────────────────────────────────
inputText.addEventListener("input", updateCount);
translateBtn.addEventListener("click", translateCurrentText);
sampleBtn.addEventListener("click", () => {
  inputText.value = samples[Math.floor(Math.random() * samples.length)];
  updateCount();
});
clearBtn.addEventListener("click", () => {
  inputText.value = "";
  outputText.textContent = "翻译结果会显示在这里。";
  updateCount();
});
swapBtn.addEventListener("click", () => {
  const ps = sourceLang.value;
  sourceLang.value = targetLang.value;
  targetLang.value = ps;
  const translated = outputText.textContent.trim();
  if (translated && !translated.startsWith("[Demo") && !translated.startsWith("[演示") && translated !== "翻译结果会显示在这里。") {
    inputText.value = translated; updateCount();
  }
});
copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(outputText.textContent);
  engineMeta.textContent = "已复制";
});

labInput.addEventListener("input", () => {
  const chars = Array.from(labInput.value);
  if (chars.length > LENS_CHAR_LIMIT) labInput.value = chars.slice(0, LENS_CHAR_LIMIT).join("");
  updateLabCount();
});
labSwapBtn.addEventListener("click", () => {
  const ps = labSourceLang.value;
  labSourceLang.value = labTargetLang.value;
  labTargetLang.value = ps;
});
analyzeBtn.addEventListener("click", visualizeTransformer);

// auto-play button
if (autoPlayBtn) {
  autoPlayBtn.addEventListener("click", () => {
    const model = buildTransformerModel(labInput.value.trim() || "Hello");
    startAutoPlay(model);
  });
}

// decoder controls
if (decoderStepBtn) decoderStepBtn.addEventListener("click", decoderStepForward);
if (decoderAutoBtn) decoderAutoBtn.addEventListener("click", decoderAutoToggle);
if (decoderResetBtn) decoderResetBtn.addEventListener("click", decoderReset);

// layer slider
if (layerSlider) {
  layerSlider.addEventListener("input", () => {
    const li = parseInt(layerSlider.value);
    const model = buildTransformerModel(labInput.value.trim() || "Hello");
    renderLayerView(model.tokens, model.layerAttentions, li);
  });
}

// ── 启动 ────────────────────────────────────────────────────────────
loadStatus().then(() => {
  const initialLens = new URLSearchParams(window.location.search).get("lens");
  if (initialLens) {
    labInput.value = Array.from(initialLens).slice(0, LENS_CHAR_LIMIT).join("");
    updateLabCount();
  }
  visualizeTransformer();
}).catch(error => {
  statusText.textContent = "状态不可用";
  setupHint.textContent = error.message;
  visualizeTransformer();
});
updateCount();
updateLabCount();
