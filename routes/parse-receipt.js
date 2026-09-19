// routes/parse-receipt.js
// POST /parse-receipt  body: { imageBase64, mimeType?, hintBlock? }
// Returns: { ok, shopId, shopName, amount, confidence, needsConfirmation, ambiguous, candidates, raw }

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const USE_REAL_AI = true;
const MODEL = "gemini-3.6-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// ------------------------------------------------------------- normalizing
const NOISE = [
  "pvt",
  "ltd",
  "private",
  "limited",
  "inc",
  "llp",
  "co",
  "vellore",
  "vit",
  "campus",
  "university",
  "branch",
  "outlet",
  "gst",
  "invoice",
  "bill",
  "receipt",
  "tax",
  "total",
];

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/['\u2019`.]/g, "") // Foody's -> foodys
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s) {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 1 && !NOISE.includes(t));
}

function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

function similarity(a, b) {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 0 : 1 - levenshtein(a, b) / max;
}

// ------------------------------------------------- base name / block split
// "Nescafe (SJT)" -> { base: "Nescafe", block: "SJT" }
function splitName(name) {
  const m = String(name).match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m
    ? { base: m[1].trim(), block: m[2].trim() }
    : { base: String(name).trim(), block: null };
}

// data/shops.json — note the path
const shops = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "data", "shops.json"), "utf8"),
);

const enriched = shops.map((s) => ({ ...s, ...splitName(s.name) }));

const MAP_PATH = path.join(__dirname, "..", "data", "merchant-map.json");

function loadMap() {
  try {
    return JSON.parse(fs.readFileSync(MAP_PATH, "utf8")).mappings || {};
  } catch {
    return {};
  }
}

function saveMapping(merchantName, shopId) {
  let file = { mappings: {} };
  try {
    file = JSON.parse(fs.readFileSync(MAP_PATH, "utf8"));
  } catch {}
  file.mappings = file.mappings || {};
  file.mappings[normalize(merchantName)] = shopId;
  fs.writeFileSync(MAP_PATH, JSON.stringify(file, null, 2));
}

// --------------------------------------------------------------- scoring
function scoreAgainst(aiName, target) {
  const aiNorm = normalize(aiName);
  const tNorm = normalize(target);
  if (!aiNorm || !tNorm) return 0;
  if (aiNorm === tNorm) return 1;

  let score = 0;
  if (aiNorm.includes(tNorm) || tNorm.includes(aiNorm)) score = 0.9;

  const aiTokens = tokens(aiName);
  const tTokens = tokens(target);
  if (tTokens.length) {
    const hits = tTokens.filter((t) =>
      aiTokens.some((a) => a === t || similarity(a, t) >= 0.8),
    ).length;
    score = Math.max(score, (hits / tTokens.length) * 0.85);
  }

  return Math.max(score, similarity(aiNorm, tNorm) * 0.8);
}

// Match on BASE name, then disambiguate by block when we have one.
function matchShop(aiName, hintBlock) {
  if (!aiName) return { candidates: [], confidence: 0, ambiguous: false };

  const scored = enriched
    .map((s) => ({
      shop: s,
      score: Math.max(
        scoreAgainst(aiName, s.base),
        scoreAgainst(aiName, s.name),
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  if (!top || top.score < 0.55) {
    return {
      candidates: [],
      confidence: top ? top.score : 0,
      ambiguous: false,
    };
  }

  // everything within 0.05 of the top score is a genuine tie
  let tied = scored
    .filter((s) => top.score - s.score <= 0.05)
    .map((s) => s.shop);

  // a block hint (from the receipt, or from the frontend) breaks the tie
  if (hintBlock && tied.length > 1) {
    const h = normalize(hintBlock);
    const narrowed = tied.filter((s) => {
      if (!s.block) return false;
      const b = normalize(s.block);
      return b.includes(h) || h.includes(b);
    });
    if (narrowed.length) tied = narrowed;
  }

  return {
    candidates: tied,
    confidence: top.score,
    ambiguous: tied.length > 1,
  };
}

// ---------------------------------------------------------------- prompt
function buildPrompt() {
  const groups = {};
  for (const s of enriched) {
    (groups[s.base] = groups[s.base] || []).push(s.block);
  }
  const list = Object.entries(groups)
    .map(([base, blocks]) => {
      const real = blocks.filter(Boolean);
      return real.length
        ? `- ${base}  [locations: ${real.join(", ")}]`
        : `- ${base}`;
    })
    .join("\n");

  return `You are reading a photo of a receipt, bill, or payment screenshot from VIT Vellore campus in India.

Extract:
1. The shop/merchant name.
2. The total amount paid in rupees, as a plain number (no symbol, no commas).
3. Any building/block indicator printed on the receipt (e.g. "SJT", "Q Block", "MH", "D Block"), if present.

Known campus shops:
${list}

Rules:
- Return the BASE shop name exactly as written above, without the location bracket.
- Put any block/building text visible on the receipt in the "block" field. If none is visible, use null. Do NOT guess the block.
- If no shop above plausibly matches, return the raw merchant name and set "inList" to false.
- Use the grand total / amount paid, not a subtotal or a single line item.
- If the total is unreadable, set amount to null.

Respond with ONLY this JSON, nothing else:
{"shopName": string, "block": string|null, "inList": boolean, "amount": number|null, "notes": string}`;
}

const MODELS = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(imageBase64, mimeType) {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  let lastErr;

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inline_data: { mime_type: mimeType, data: imageBase64 } },
                  { text: buildPrompt() },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
            },
          }),
        });

        if (res.status === 503 || res.status === 429) {
          const wait = 1000 * Math.pow(2, attempt);
          console.log(`[gemini] ${model} ${res.status}, retrying in ${wait}ms`);
          lastErr = new Error(`${model} ${res.status}`);
          await sleep(wait);
          continue;
        }

        if (!res.ok) {
          const body = await res.text();
          lastErr = new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
          console.log(`[gemini] ${model} failed: ${res.status}`);
          break;
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log(`[gemini] answered by ${model}`);
        return JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch (e) {
        lastErr = e;
        await sleep(500);
      }
    }
    console.log(`[gemini] giving up on ${model}, trying next`);
  }

  throw lastErr || new Error("All Gemini models unavailable");
}

// ------------------------------------------------------------------ route
router.post("/", async (req, res) => {
  try {
    const {
      imageBase64,
      mimeType = "image/jpeg",
      hintBlock = null,
    } = req.body || {};

    if (!USE_REAL_AI) {
      return res.json({
        ok: true,
        shopId: 9,
        shopName: "TT Food Court",
        amount: 85,
        confidence: 1,
        needsConfirmation: false,
        ambiguous: false,
        candidates: [],
        raw: { stub: true },
      });
    }
    if (!(process.env.GEMINI_API_KEY || "").trim()) {
      return res
        .status(500)
        .json({ ok: false, error: "GEMINI_API_KEY not set in Secrets" });
    }
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res
        .status(400)
        .json({ ok: false, error: "imageBase64 is required" });
    }

    const clean = imageBase64.includes(",")
      ? imageBase64.split(",").pop()
      : imageBase64;

    const ai = await callGemini(clean, mimeType);

    const learned = loadMap()[normalize(ai.shopName)];
    if (learned) {
      const s = enriched.find((x) => x.id === learned);
      if (s) {
        return res.json({
          ok: true,
          shopId: s.id,
          shopName: s.name,
          amount: ai.amount ?? null,
          confidence: 1,
          needsConfirmation: ai.amount == null,
          ambiguous: false,
          candidates: [],
          source: "learned",
          raw: ai,
        });
      }
    }

    const block = hintBlock || ai.block || null;
    const { candidates, confidence, ambiguous } = matchShop(ai.shopName, block);

    const resolved = candidates.length === 1 ? candidates[0] : null;

    res.json({
      ok: true,
      shopId: resolved ? resolved.id : null,
      shopName: resolved ? resolved.name : ai.shopName || null,
      amount: ai.amount ?? null,
      confidence: Number(confidence.toFixed(2)),
      needsConfirmation: !resolved || ai.amount == null,
      ambiguous,
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
      })),
      raw: ai,
    });
  } catch (err) {
    console.error("[parse-receipt]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/confirm", (req, res) => {
  const { merchantName, shopId } = req.body || {};
  if (!merchantName || !shopId) {
    return res
      .status(400)
      .json({ ok: false, error: "merchantName and shopId required" });
  }
  const s = enriched.find((x) => x.id === Number(shopId));
  if (!s) return res.status(400).json({ ok: false, error: "unknown shopId" });
  saveMapping(merchantName, s.id);
  res.json({
    ok: true,
    learned: { merchantName, shopId: s.id, shopName: s.name },
  });
});

module.exports = router;
