// api/questioncheck.js
// ─────────────────────────────────────────────────────────────────────────────
// v2 · answer-key verification (back-test) + detailed per-option explanation
//
// পুরনো ভার্সনের সমস্যা ছিল:
//   • AI একই call-এ "উত্তর দাও + ব্যাখ্যা দাও" করত → key মিলে গেলেও ব্যাখ্যা বানানো/ভুল হত
//     (যেমন: রামসর চুক্তি ১৯৭১ — উত্তর ঠিক, ব্যাখ্যায় ভারত-বাংলাদেশ যুদ্ধবন্দী)
//   • letter ↔ option mapping AI-এর হাতে ছিল → ভুল অপশনে উত্তর বসার ঝুঁকি
//   • key সন্দেহ হলেও "prমাণ" ছাড়াই বদলে যেত, আবার প্রমাণ থাকলেও বদলাত না
//
// নতুন ধাপ:
//   1) blind solve   — উত্তর key না দিয়ে próprio সমাধান (anchoring বন্ধ)
//   2) back-test     — "বর্তমান key ভুল" ধরে নিয়ে disprove করার চেষ্টা (প্রসিকিউটর)
//   3) verdict       — কোডে নির্ধারিত: দুটো pass মিললেই key বদলায়, নাহলে key অটুট
//   4) writer        — ফরম্যাট ঠিক + সঠিক উত্তর ও প্রতিটি অপশনের ব্যাখ্যা (index ধরে)
//   5) critic        — ব্যাখ্যা প্রশ্নের বিষয়ের সাথেই আছে কি না, বানানো তথ্য আছে কি না
//
// letter / option লেখা কোড থেকেই বসে (composeExplanation) — AI কখনো letter লিখে না।
//
// ENV (সবই optional):
//   GROQ_API_KEY_3            — বাধ্যতামূলক
//   CHECK_MODEL_PRIMARY       — ডিফল্ট qwen/qwen3.6-27b
//   CHECK_MODEL_FALLBACK      — ডিফল্ট openai/gpt-oss-120b
//   CHECK_BUDGET_MS           — পুরো কাজের সময়সীমা, ডিফল্ট 9000
//   CHECK_EXPLANATION_MODE    — refresh (ডিফল্ট) | auto | keep
//   CHECK_MULTILINE_EXPLANATION=1 — ব্যাখ্যায় newline (⚠ ক্লায়েন্টের TSV পার্সার ভাঙতে পারে)
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// model গুলো env দিয়ে বদলানো যাবে, ডিফল্ট আগের মতোই
const MODEL_PRIMARY = process.env.CHECK_MODEL_PRIMARY || 'qwen/qwen3.6-27b';
const MODEL_FALLBACK = process.env.CHECK_MODEL_FALLBACK || 'openai/gpt-oss-120b';

// পুরো কাজ শেষ করার সময়সীমা (ms). Vercel-এ default 10s হলে এই budget নিরাপদ।
const DEFAULT_BUDGET_MS = Number(process.env.CHECK_BUDGET_MS || 9000);

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const SCRIPT_URLS = {
  'ssc': 'https://script.google.com/macros/s/AKfycby8cADzc2mMlr-3KoLSmQLsg8AhLA9ViXL5kzSyhLwaRfutZW5er3qTO1PFmY2w-4VmUQ/exec',
  'gk': 'https://script.google.com/macros/s/AKfycbw940Ugc3FsH1NFHCnjbEc7uivqqvwacUh_gQv_UKqXBXlJ7uhGa9ptTre5LROgEVwl/exec',
  'wbpsc': 'https://script.google.com/macros/s/AKfycbzWUjN4QuZtimLgtx-sd5oVqgoi4NhMVou3qkQwthV7AcL4DkAPycJ-YNjCnQh8w_h0/exec',
  'defence': 'https://script.google.com/macros/s/AKfycbz04QAu660SM9GVplMtomNL28ug7XE3xE1lYrkJm2y3DBylAvzRD4Xxh4vZiozNO-2l/exec',
  'class5': 'https://script.google.com/macros/s/AKfycbwtJzw0xGfY-3p2KY3z-vf_d5CVdR_alfIX4B5S9QEFi1tYtrb6_MtzX9OSiQ6-L91w/exec',
  'class6': 'https://script.google.com/macros/s/AKfycbxmUCjeYIu7Dikfnbl2LmZoeplLS0iuLWEsvGTx0jYi4i1uK3WMEF3Bqqmf72teEjgI/exec',
  'class7': 'https://script.google.com/macros/s/AKfycbwoKkn_uJRnjsccqTpROptSkFxjMIvi-S9UlX6qZaYeA7N0nWoL-FZJILhqFFmKMjjKhQ/exec',
  'class8': 'https://script.google.com/macros/s/AKfycbyS4bWgeppQwuHX52MY1DGMENHSz-hIqMClHXz7VQIcYi221vG_vBvcWUenUqupe-bmGg/exec',
  'class9': 'https://script.google.com/macros/s/AKfycbwiSmFFhax_D_t0jnRgshGSzPP6YvMdx5xY4_G-lHiRF12wYkUEiZG6ren1LXNh3IoD/exec',
  'class10': 'https://script.google.com/macros/s/AKfycbwB5PT3N8nUByW5GVv9--JenYdRm7rKTixkLe_XYmKkavIKlvoVrMLIgAXgmAiS3cUSOQ/exec'
};

// ═══════════════════════════════════════════════════════════════════════════
// ছোট utility
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r/g, '').trim();
}

function stripTags(text) {
  return clean(text).replace(/<[^>]*>/g, ' ');
}

const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };

// তুলনার জন্য normalize: ট্যাগ, যুক্তাক্ষর-ঝামেলা, বাংলা অঙ্ক, punctuation
function normText(text) {
  return stripTags(text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[০-৯]/g, function (d) { return BN_DIGITS[d]; })
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/["'“”‘’।,.;:!?()\[\]{}]/g, '')
    .trim();
}

// অপশন মেলানোর key — whitespace বাদ
function optionKey(text) {
  return normText(text).replace(/\s+/g, '');
}

function bigrams(text) {
  const t = text.replace(/\s+/g, ' ');
  const out = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
}

// 0..1 — লেখা কতটা একই রকম (rewrite ধরা জন্য)
function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const entry of A) { total += entry[1]; inter += Math.min(entry[1], B.get(entry[0]) || 0); }
  for (const count of B.values()) total += count;
  return total ? (2 * inter) / total : 0;
}

// শীটে যাওয়ার আগে markdown/নিউলাইন পরিষ্কার
// ⚠ ক্লায়েন্ট TSV ভাঙে নতুন লাইনে (split(/\r?\n/) + split('\t')) — তাই ডিফল্ট এক লাইন
function sanitize(text, multiline) {
  let out = clean(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[ \t]+/g, ' ');
  out = multiline
    ? out.replace(/\n{3,}/g, '\n\n')
    : out.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ');
  return out.trim();
}

function parseJSON(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(text); } catch (e) { /* নিচে আবার চেষ্টা */ }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch (e) { return null; }
  }
  return null;
}

// 0/1/2/3 বা 'A'/'b' → index
function toIndex(value, count) {
  if (value === null || value === undefined || value === '') return null;
  let idx = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const letter = LETTERS.indexOf(trimmed.toUpperCase());
    if (trimmed.length === 1 && letter >= 0) idx = letter;
    else idx = parseInt(trimmed, 10);
  }
  return Number.isInteger(idx) && idx >= 0 && idx < count ? idx : null;
}

// AI যে উত্তর দিল (text + index) → আসল index. টেক্সট আর index মিলছে না হলে টেক্সট জেতে।
function resolveAnswer(answerText, answerIndex, options) {
  const count = options.length;
  const byIndex = toIndex(answerIndex, count);

  if (typeof answerText === 'string' && answerText.trim()) {
    const target = optionKey(answerText);
    const hits = [];
    options.forEach(function (option, i) {
      if (target && optionKey(option) === target) hits.push(i);
    });
    if (hits.length === 1) {
      const conflict = byIndex !== null && byIndex !== hits[0]
        ? 'text=' + hits[0] + ' vs index=' + byIndex
        : null;
      return { index: hits[0], conflict: conflict };
    }
    if (hits.length > 1) return { index: null, conflict: 'duplicate-option-text' };
  }
  return { index: byIndex, conflict: null };
}

function findDuplicateOptions(options) {
  const seen = new Map();
  const dupes = [];
  options.forEach(function (option, i) {
    const key = optionKey(option);
    if (!key) return;
    if (seen.has(key)) dupes.push([seen.get(key), i]);
    else seen.set(key, i);
  });
  return dupes;
}

// ───────────────────────────────────────────────────────────────────────────
// ব্যাখ্যা জোড়া লাগানো — এখানেই letter ↔ option লেখা বসে (AI নয়)
// ───────────────────────────────────────────────────────────────────────────
function composeExplanation(parts) {
  const options = parts.options;
  const keyIndex = parts.keyIndex;
  const multiline = !!parts.multiline;
  const sep = multiline ? '\n' : ' • ';
  const lines = [];

  lines.push('✅ সঠিক উত্তর: (' + LETTERS[keyIndex] + ') ' + sanitize(options[keyIndex]));

  const body = sanitize(parts.answerExplanation);
  if (body) lines.push(body);

  const wrong = [];
  const seen = new Set();
  for (const item of (parts.optionExplanations || [])) {
    const idx = toIndex(item && item.index, options.length);
    if (idx === null || idx === keyIndex || seen.has(idx)) continue;
    const why = sanitize(item.why);
    if (!why) continue;
    seen.add(idx);
    wrong.push('(' + LETTERS[idx] + ') ' + sanitize(options[idx]) + ' — ' + why);
  }
  if (wrong.length) {
    lines.push((multiline ? '\n' : '') + 'কেন বাকি অপশনগুলো নয়: ' + wrong.join('; '));
  }

  const text = lines.filter(Boolean).join(sep);
  return multiline ? text : text.replace(/\s*•\s*/g, ' • ').replace(/\s{2,}/g, ' ');
}

// ═══════════════════════════════════════════════════════════════════════════
// prompts
// ═══════════════════════════════════════════════════════════════════════════

const GROUND_RULES = `━━ অতিরিক্ত কঠোর নিয়ম (সব ধাপে) ━━
• যে তথ্য নিশ্চিতভাবে জানো শুধু সেটাই লেখো। সাল, তারিখ, নাম, স্থান আন্দাজ করবে না।
• প্রশ্নের বিষয় (যেমন "রামসর চুক্তি") আর অন্য কোনো ঘটনা/চুক্তি মিলিয়ে ফেলবে না।
  একই বছরে অন্য ঘটনা থাকলেও সেটা এই প্রশ্নের উত্তর নয় — সেটাই সবচেয়ে বড় ভুল।
• অপশনের লেখা হুবহু বসাবে, নিজের ভাষায় বদলাবে না, সংক্ষেপ করবে না।
• মনে না থাকলে সৎভাবে "নিশ্চিত নই" লেখো — বানানো ব্যাখ্যার চেয়ে সেটা অনেক ভালো।
• শুধু valid JSON ফেরত দাও, markdown fence বা অতিরিক্ত লেখা নয়।`;

function buildSolvePrompt(ctx) {
  const optionLines = ctx.options.map(function (option, i) {
    return LETTERS[i] + '. ' + clean(option);
  }).join('\n');

  return {
    system: `তুমি বাংলাদেশের প্রতিযোগিতামূলক পরীক্ষার (SSC/HSC/WBPSC/Class 5-10) অভিজ্ঞ প্রশ্ন-প্রণেতা ও পরীক্ষক।
নিচের MCQ-টি তোমাকে সমাধান করতে হবে। উত্তর key তোমাকে দেয়া হয়নি — সম্পূর্ণ নিজের জ্ঞান থেকে সমাধান করো।

${GROUND_RULES}

━━ কীভাবে করবে ━━
1. topicAnchor: প্রশ্নটি ঠিক কোন সত্তা/ঘটনা/সংজ্ঞা নিয়ে (এক লাইনে, নাম ধরে)।
2. নিজের জ্ঞান দিয়ে সঠিক অপশন বেছে নাও।
3. answerText-এ সেই অপশনের লেখা হুবহু বসাও (শুধু A/B/C/D নয় — পুরো লেখা)।
4. keyFacts: ২-৪টি ছোট তথ্য যেগুলো সিদ্ধান্তে পৌঁছাতে ব্যবহার করলে; প্রতিটির সাথে certainty (high/medium/low)।
5. optionChecks: প্রতিটি অপশনের জন্য এক লাইনে কেন সঠিক বা কেন ভুল।
6. গণিত/পদার্থ/রসায়ন হলে হিসাবটা keyFacts-এ দেখাও।

━━ JSON ━━
{
  "topicAnchor": "",
  "answerIndex": 0,
  "answerText": "",
  "confidence": 0,
  "keyFacts": [{ "statement": "", "certainty": "high" }],
  "optionChecks": [{ "index": 0, "verdict": "correct", "reason": "" }],
  "ambiguity": null
}`,
    user: `প্রশ্ন: ${ctx.question}

অপশন:
${optionLines}

বিষয়: ${ctx.subject || 'General'}
অধ্যায়: ${ctx.chapter || 'General'}

Return JSON only.`
  };
}

function buildBackTestPrompt(ctx) {
  const optionLines = ctx.options.map(function (option, i) {
    return LETTERS[i] + '. ' + clean(option);
  }).join('\n');

  return {
    system: `তুমি একজন কঠোর পরীক্ষক (prosecutor)। নিচের প্রশ্নে একটি "বর্তমান answer key" দেয়া আছে।
তোমার কাজ: ধরে নাও এই key টা ভুল, এবং যাচাই করে দেখো সত্যিই ভুল প্রমাণ করা যায় কি না।

${GROUND_RULES}

━━ পদ্ধতি (এই ক্রমে) ━━
1. claim: বর্তমান key ঠিক কী দাবি করছে (অপশনের লেখা ধরে)।
2. disproofTest: প্রশ্নের বিষয়ের "নিজস্ব সনাক্তকারী তথ্য" কী — সেটা ঠিক করো।
   উদাহরণ: রামসর চুক্তি → স্বাক্ষরের সাল ও স্থান, কার্যকর হওয়ার সাল, পক্ষগুলো।
   সংজ্ঞা হলে সংজ্ঞার শর্ত; গণিত হলে সমাধান করে মান মেলানো; ব্যাকরণ হলে নিয়ম প্রয়োগ।
3. attempt: পরীক্ষাটা চালিয়ে ফল লেখো (হিসাব থাকলে হিসাবসহ)।
4. verdict: refuted | not_refuted | uncertain

━━ কঠোর নিয়ম ━━
• প্রমাণ ছাড়া refuted বলা যাবে না। "মনে হয় ভুল" টাইপ কিছু চলবে না।
• ভিন্ন ঘটনার সাথে সাল/নাম জুড়ে দিলে সেটা প্রমাণ নয়, বরং তোমার ভুল।
• সত্যিই বৈধ প্রমাণ না পেলে verdict = "not_refuted" — এটা ব্যর্থতা নয়, ভালো ফল।
• একটি বছর/নাম শুধু "অন্য কোনো ঘটনার সাথে পরিচিত" বলে সেটাকে ভুল প্রমাণ ধরা যাবে না।
• refuted হলে alternativeText-এ সঠিক অপশনের লেখা হুবহু দাও; নাহলে null।
• প্রশ্নটাই ভুল/একাধিক উত্তর সম্ভব হলে verdict = "uncertain" এবং ambiguity-তে কারণ লেখো।

━━ JSON ━━
{
  "claim": "",
  "disproofTest": "",
  "attempt": "",
  "verdict": "not_refuted",
  "alternativeIndex": null,
  "alternativeText": null,
  "evidence": [""],
  "confidence": 0,
  "ambiguity": null
}`,
    user: `প্রশ্ন: ${ctx.question}

অপশন:
${optionLines}

বর্তমান answer key: index ${ctx.currentKey} = "${clean(ctx.options[ctx.currentKey])}" (${LETTERS[ctx.currentKey]})
বিষয়: ${ctx.subject || 'General'}
অধ্যায়: ${ctx.chapter || 'General'}

ধরে নাও এই key ভুল। প্রমাণ খোঁজো, না পেলে not_refuted দাও। JSON only.`
  };
}

function buildWriterPrompt(ctx) {
  const optionLines = ctx.options.map(function (option, i) {
    return LETTERS[i] + '. ' + clean(option);
  }).join('\n');
  const facts = (ctx.facts || []).slice(0, 6).map(function (f) { return '- ' + f; }).join('\n');

  return {
    system: `তুমি একজন অভিজ্ঞ শিক্ষক। নিচের প্রশ্নের চূড়ান্ত সঠিক উত্তর আগেই ঠিক হয়ে গেছে (নিচে দেয়া)।
তোমার কাজ তিনটি — ফরম্যাট ঠিক করা, সঠিক উত্তর কেন সঠিক তার ব্যাখ্যা, এবং প্রতিটি ভুল অপশন কেন ভুল তার আলাদা কারণ।

${GROUND_RULES}

━━ ১) ফরম্যাট ━━
• প্রশ্নে "underlined word/segment/portion" থাকলে যে শব্দ/অংশটি বোঝাচ্ছে সেটিকে <u>...</u> দিয়ে মার্ক করো।
  যেমন: "He gave a haughty consent" → "He gave a <u>haughty</u> consent"
• গণিত/রসায়ন/পদার্থ: \\(x^2\\), \\(\\frac{a}{b}\\), \\(H_2O\\), \\(Fe^{2+}\\)
• স্পষ্ট টাইপো/বানান ঠিক করো, কিন্তু প্রশ্নের অর্থ বা অপশনের ক্রম বদলাবে না।
• অপশন ঠিক থাকলে হুবহু ফেরত দাও।

━━ ২) answerExplanation (৩-৬ বাক্য) ━━
• প্রশ্নটি ঠিক কী জানতে চাইছে সেটা দিয়ে শুরু করো, তারপর সঠিক উত্তরটি কেন সঠিক তা বলো।
• প্রশ্নের বিষয়ের (একই সত্তা/ঘটনা) ভেতরেই থাকো। অন্য চুক্তি/ঘটনার বর্ণনা দিয়ে উত্তর justify করবে না।
• যে তথ্য দিয়ে উত্তর প্রমাণ হয় (সাল, স্থান, সংজ্ঞা, সূত্র) সেটাই মূল কথা।
• প্রশ্ন "কত সালে স্বাক্ষরিত" হলে আর অপশনে "কার্যকর হওয়ার সাল" থাকলে — এই পার্থক্যটা স্পষ্ট করে বলো।

━━ ৩) optionExplanations (প্রতিটি অপশনের জন্য, ৪টাই) ━━
• সঠিক অপশন: status "correct", why = কেন এটাই সঠিক (সংক্ষেপে)।
• ভুল অপশন: status "wrong", why = নির্দিষ্ট কারণ। শুধু "এটি সঠিক নয়" লেখা চলবে না।
  উদাহরণ ভালো কারণ: "এটি চুক্তি কার্যকর হওয়ার সাল, স্বাক্ষরের সাল নয়"।
• নির্দিষ্ট তথ্য না জানলে জোর করে কারণ বানাবে না — লিখো "এই মানটি এই প্রশ্নের দাবির সাথে মেলে না"।
• index অবশ্যই 0-${ctx.options.length - 1} এর মধ্যে, অপশনের ক্রম অনুযায়ী।

━━ JSON ━━
{
  "topicAnchor": "",
  "correctedQuestion": "",
  "correctedOptions": ["", "", "", ""],
  "answerExplanation": "",
  "optionExplanations": [{ "index": 0, "status": "correct", "why": "" }],
  "factsUsed": [""]
}`,
    user: `প্রশ্ন: ${ctx.question}

অপশন:
${optionLines}

চূড়ান্ত সঠিক উত্তর: index ${ctx.keyIndex} = "${clean(ctx.options[ctx.keyIndex])}" (${LETTERS[ctx.keyIndex]})
বিষয়: ${ctx.subject || 'General'}
অধ্যায়: ${ctx.chapter || 'General'}
${facts ? '\nযাচাই ধাপে পাওয়া তথ্য (এর বাইরে নতুন সাল/নাম বানাবে না):\n' + facts + '\n' : ''}
${ctx.issues && ctx.issues.length ? '\nআগের ব্যাখ্যায় ধরা পড়া সমস্যা, এবার এড়িয়ে যাও:\n- ' + ctx.issues.join('\n- ') + '\n' : ''}
Return JSON only.`
  };
}

function buildCriticPrompt(ctx) {
  const optionLines = ctx.options.map(function (option, i) {
    return LETTERS[i] + '. ' + clean(option);
  }).join('\n');
  const perOption = (ctx.optionExplanations || []).map(function (item) {
    return 'index ' + item.index + ' → ' + clean(item.why);
  }).join('\n');

  return {
    system: `তুমি একজন স্বাধীন পর্যালোচক। নিচে প্রশ্ন, চূড়ান্ত সঠিক উত্তর এবং তৈরি করা ব্যাখ্যা আছে।
তোমার কাজ: ব্যাখ্যাটা যাচাই করা। তুমি ব্যাখ্যা সুন্দর করার চেষ্টা করবে না — শুধু ভুল ধরবে।

━━ যা যাচাই করবে ━━
1. topicAligned — ব্যাখ্যা কি প্রশ্নের বিষয় (একই সত্তা/ঘটনা) নিয়েই? ভিন্ন চুক্তি/ঘটনা দিয়ে উত্তর justify করা হয়েছে?
2. explainsFinalAnswer — ব্যাখ্যা কি সত্যিই index ${ctx.keyIndex} ("${clean(ctx.options[ctx.keyIndex])}") এর পক্ষে? অন্য অপশনের পক্ষে যুক্তি দিলে ধরা পড়বে।
3. optionCoverage — প্রতিটি ভুল অপশনের জন্য নির্দিষ্ট কারণ আছে? "এটি সঠিক নয়" ধাঁচের ফাঁকা কারণ থাকলে badOptionIndexes-এ দাও।
4. inventedDetail — কোনো সাল/নাম/স্থান সন্দেহজনক বা প্রশ্নের বিষয়ের সাথে বেমানান?
5. answerMapping — ব্যাখ্যায় যে অপশনের কথা বলা হচ্ছে তার লেখা আর index মিলছে?

━━ JSON ━━
{
  "pass": false,
  "topicAligned": false,
  "explainsFinalAnswer": false,
  "inventedDetail": false,
  "answerExplanationOk": false,
  "badOptionIndexes": [],
  "issues": [""]
}`,
    user: `প্রশ্ন: ${ctx.question}

অপশন:
${optionLines}

চূড়ান্ত সঠিক উত্তর: index ${ctx.keyIndex} = "${clean(ctx.options[ctx.keyIndex])}" (${LETTERS[ctx.keyIndex]})

তৈরি করা answerExplanation:
${clean(ctx.answerExplanation)}

প্রতিটি অপশনের কারণ:
${perOption}

JSON only.`
  };
}

// ফরম্যাট-only ছোট call (underline মিস হলে fallback model দিয়ে)
function buildFormatPrompt(ctx) {
  const optionLines = ctx.options.map(function (option, i) {
    return LETTERS[i] + '. ' + clean(option);
  }).join('\n');
  return {
    system: `You fix MCQ formatting only. No explanations.

TASKS:
1. If the question mentions "underlined word/segment/portion", wrap the intended word/phrase in <u>...</u>.
2. Math/chemistry/physics → LaTeX inside \\( ... \\).
3. Fix obvious typos only. Never change meaning or option order.

Return valid JSON only:
{"correctedQuestion": "", "correctedOptions": ["", "", "", ""]}`,
    user: `Question: ${ctx.question}

Options:
${optionLines}

Return JSON only.`
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// handler
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const body = req.body || {};
  const question = clean(body.question);
  let options = body.options;
  const subject = clean(body.subject);
  const chapter = clean(body.chapter);
  const rowIndex = body.rowIndex;
  const quizType = clean(body.quizType);
  const alreadyChecked = !!body.alreadyChecked;
  const force = !!body.force || !!body.recheck;
  const multiline = process.env.CHECK_MULTILINE_EXPLANATION === '1';

  if (typeof options === 'string') options = options.split('|').map(function (o) { return clean(o); });
  options = Array.isArray(options) ? options.map(function (o) { return clean(o); }) : [];

  if (!question || options.length < 2) {
    return res.status(400).json({ error: 'question and options required' });
  }

  if (alreadyChecked && !force) {
    return res.status(200).json({
      needsCorrection: false,
      reason: 'already-checked',
      message: 'Already verified'
    });
  }

  // ─── Fast path: এই ব্যাখ্যাটা আগেই আমাদের pipeline লিখেছে ───
  // client note পাঠালে কোনো AI call ছাড়াই ফেরত — নাহলে প্রতিবার লোডে ৪টা call হতো
  const providedNote = clean(body.note || body.currentExplanation || '');
  if (!force && !body.forceExplanation && providedNote.indexOf('✅ সঠিক উত্তর:') === 0) {
    return res.status(200).json({
      needsCorrection: false,
      reason: 'already-explained',
      answerKeyStatus: 'skipped',
      aiExplanation: providedNote
    });
  }

  const currentKey = toIndex(body.correctAnswer, options.length);
  if (currentKey === null) {
    return res.status(400).json({ error: 'correctAnswer must be an option index (0-' + (options.length - 1) + ')' });
  }

  const GROQ_KEY = process.env.GROQ_API_KEY_3;
  if (!GROQ_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY_3 not set in Vercel env' });
  }

  const startedAt = Date.now();
  const budgetMs = Number(body.budgetMs) || DEFAULT_BUDGET_MS;
  const deadline = startedAt + budgetMs;
  const remaining = function () { return deadline - Date.now(); };

  // ─────────────────────────────────────────────────────────────────────────
  // AI call (JSON mode, 429/5xx-তে একবার retry)
  // ─────────────────────────────────────────────────────────────────────────
  async function callJSON(model, prompts, opts) {
    const maxTokens = (opts && opts.maxTokens) || 1200;
    const temperature = (opts && opts.temperature) === undefined ? 0.2 : opts.temperature;
    const timeoutMs = Math.max(3000, Math.min((opts && opts.timeoutMs) || 20000, remaining() + 2000));

    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
      try {
        const response = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + GROQ_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: prompts.system },
              { role: 'user', content: prompts.user }
            ],
            temperature: temperature,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' }
          }),
          signal: controller ? controller.signal : undefined
        });

        if (!response.ok) {
          const status = response.status;
          if ((status === 429 || status >= 500) && attempt === 0) { await sleep(700); continue; }
          console.warn('[' + model + '] HTTP ' + status);
          return null;
        }

        const data = await response.json();
        const raw = data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : '';
        const parsed = parseJSON(raw);
        if (!parsed) console.warn('[' + model + '] unparseable JSON');
        return parsed;
      } catch (e) {
        if (attempt === 0) { await sleep(300); continue; }
        console.warn('[' + model + '] ' + (e && e.message));
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    return null;
  }

  // primary → fallback
  async function callWithFallback(promptsFactory, opts) {
    const primary = await callJSON(MODEL_PRIMARY, promptsFactory(), opts);
    if (primary) return { parsed: primary, model: MODEL_PRIMARY };
    if (remaining() < 2500) return { parsed: null, model: null };
    const fallback = await callJSON(MODEL_FALLBACK, promptsFactory(), opts);
    return { parsed: fallback, model: fallback ? MODEL_FALLBACK : null };
  }

  const ctxBase = {
    question: question,
    options: options,
    subject: subject,
    chapter: chapter
  };

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // ধাপ ১ ∥ ধাপ ২ — blind solve আর back-test একসাথে (একে অন্যের প্রভাবে আসবে না)
    // ═══════════════════════════════════════════════════════════════════════
    const [solveResult, backTestResult] = await Promise.all([
      callWithFallback(function () { return buildSolvePrompt(ctxBase); }, { maxTokens: 1400, temperature: 0.1 }),
      callWithFallback(function () {
        return buildBackTestPrompt({
          question: question, options: options, subject: subject, chapter: chapter, currentKey: currentKey
        });
      }, { maxTokens: 1200, temperature: 0.1 })
    ]);

    const solve = solveResult.parsed || null;
    const backTest = backTestResult.parsed || null;
    const usedModels = [solveResult.model, backTestResult.model].filter(Boolean);

    if (!solve && !backTest) {
      return res.status(500).json({ error: 'Both AI passes failed', needsCorrection: false });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ধাপ ৩ — verdict (কোডে, AI-এর মুখে নয়)
    // ═══════════════════════════════════════════════════════════════════════
    const flags = [];
    const dupes = findDuplicateOptions(options);
    const ambiguousOptions = dupes.length > 0;
    if (ambiguousOptions) flags.push('ambiguous-options');

    const blind = solve
      ? resolveAnswer(solve.answerText, solve.answerIndex, options)
      : { index: null, conflict: null };
    if (blind.conflict) flags.push('blind-' + blind.conflict);
    if (solve && solve.ambiguity) flags.push('question-ambiguous');

    const refuted = backTest && clean(backTest.verdict).toLowerCase() === 'refuted';
    const altResolved = backTest
      ? resolveAnswer(backTest.alternativeText, backTest.alternativeIndex, options)
      : { index: null, conflict: null };
    if (altResolved.conflict) flags.push('backtest-' + altResolved.conflict);
    const altIndex = altResolved.index;
    const refConfidence = backTest ? Number(backTest.confidence) || 0 : 0;

    let finalKey = currentKey;
    let keyChanged = false;
    let status = 'verified';
    let verdictReason = '';

    if (ambiguousOptions) {
      // দুটো অপশনের লেখা একই হলে key বদলানো নিরাপদ নয়
      status = 'kept_ambiguous';
      verdictReason = 'একই লেখার একাধিক অপশন আছে, তাই key অপরিবর্তিত রাখা হয়েছে';
    } else if (refuted && altIndex !== null && altIndex !== currentKey) {
      const corroborated = blind.index === altIndex || refConfidence >= 85;
      const contradicted = blind.index !== null && blind.index !== altIndex;
      if (corroborated && !contradicted) {
        finalKey = altIndex;
        keyChanged = true;
        status = 'corrected';
        verdictReason = 'back-test প্রমাণ করেছে পুরনো key ভুল, এবং স্বাধীন সমাধানও একই অপশনে পৌঁছেছে';
      } else {
        status = 'kept_disputed';
        flags.push(contradicted ? 'model-conflict' : 'unconfirmed-refutation');
        verdictReason = contradicted
          ? 'এক ধাপ key বদলাতে চায়, অন্য ধাপ ভিন্ন অপশন বলছে — প্রমাণ টেকসই নয়, তাই key রাখা হলো'
          : 'refuted দাবি করা হয়েছে কিন্তু দ্বিতীয় সমর্থন নেই, তাই key রাখা হলো';
      }
    } else if (refuted && altIndex === currentKey) {
      status = 'verified';
      flags.push('backtest-inconsistent');
      verdictReason = 'refuted বলেছে কিন্তু বিকল্প হিসেবে একই অপশন দিয়েছে — key রাখা হলো';
    } else if (blind.index === null) {
      status = backTest ? 'kept_uncertain' : 'kept_unverified';
      flags.push('no-independent-answer');
      verdictReason = 'স্বাধীন সমাধান পাওয়া যায়নি, key অপরিবর্তিত';
    } else if (blind.index !== currentKey) {
      status = 'kept_uncertain';
      flags.push('blind-disagreement');
      verdictReason = 'স্বাধীন সমাধান ভিন্ন অপশন বলছে, কিন্তু key ভুল প্রমাণিত হয়নি — তাই key রাখা হলো';
    } else {
      status = 'verified';
      verdictReason = 'স্বাধীন সমাধান key-কে সমর্থন করেছে, back-test-এ ভুল প্রমাণ মেলেনি';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ধাপ ৪ — writer (ফরম্যাট + ব্যাখ্যা)
    // ═══════════════════════════════════════════════════════════════════════
    const facts = []
      .concat(Array.isArray(solve && solve.keyFacts)
        ? solve.keyFacts.map(function (f) { return clean(f && f.statement); })
        : [])
      .concat(Array.isArray(backTest && backTest.evidence)
        ? backTest.evidence.map(function (e) { return clean(e); })
        : [])
      .filter(Boolean);

    let writer = null;
    let writerModel = null;
    if (remaining() > 3500) {
      const writerResult = await callWithFallback(function () {
        return buildWriterPrompt({
          question: question,
          options: options,
          subject: subject,
          chapter: chapter,
          keyIndex: finalKey,
          facts: facts
        });
      }, { maxTokens: 2600, temperature: 0.25 });
      writer = writerResult.parsed;
      writerModel = writerResult.model;
      if (writerModel) usedModels.push(writerModel);
    }

    // ─── ফরম্যাট যাচাই: অর্থ পাল্টে দিলে বাদ ──────────────────────────────
    let correctedQuestion = question;
    let formatChanged = false;

    if (writer) {
      const candidate = clean(writer.correctedQuestion);
      if (candidate) {
        const plainOld = stripTags(question).replace(/\s+/g, ' ').trim();
        const plainNew = stripTags(candidate).replace(/\s+/g, ' ').trim();
        const tagOnly = normText(plainOld) === normText(plainNew);
        const sim = similarity(plainOld, plainNew);
        if (tagOnly || sim >= 0.85) {
          correctedQuestion = candidate;
          formatChanged = normText(candidate) !== normText(question) || candidate !== question;
        } else {
          flags.push('question-rewrite-blocked');
        }
      }
    }

    // underline দরকার কিন্তু নেই → ছোট format-only call (fallback model)
    const needsUnderline = /under-?line/i.test(question);
    const hasUnderline = /<u>[\s\S]+<\/u>/i.test(correctedQuestion);
    if (needsUnderline && !hasUnderline && remaining() > 3000) {
      const formatResult = await callJSON(MODEL_FALLBACK, buildFormatPrompt(ctxBase), { maxTokens: 1200, temperature: 0.1 });
      if (formatResult && /<u>[\s\S]+<\/u>/i.test(clean(formatResult.correctedQuestion))) {
        correctedQuestion = clean(formatResult.correctedQuestion);
        formatChanged = true;
        usedModels.push(MODEL_FALLBACK + ':format');
      } else {
        flags.push('underline-missing');
      }
    }

    // অপশন: সংখ্যা বদলালে বা লেখা অনেক বদলে গেলে বাদ
    let correctedOptions = options.slice();
    if (writer && Array.isArray(writer.correctedOptions)) {
      const incoming = writer.correctedOptions.map(function (o) { return clean(o); });
      if (incoming.length === options.length) {
        const safe = incoming.map(function (option, i) {
          const plainOld = stripTags(options[i]).replace(/\s+/g, ' ').trim();
          const plainNew = stripTags(option).replace(/\s+/g, ' ').trim();
          if (!option) return options[i];
          if (normText(plainOld) === normText(plainNew)) return option;
          return similarity(plainOld, plainNew) >= 0.85 ? option : options[i];
        });
        if (safe.some(function (option, i) { return option !== options[i]; })) formatChanged = true;
        correctedOptions = safe;
      } else {
        flags.push('option-count-mismatch');
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ধাপ ৫ — critic (ব্যাখ্যা প্রশ্নের বিষয়ের সাথে আছে কি না)
    // ═══════════════════════════════════════════════════════════════════════
    function normalizeOptionExplanations(list) {
      const out = [];
      const seen = new Set();
      for (const item of (Array.isArray(list) ? list : [])) {
        const idx = toIndex(item && item.index, options.length);
        if (idx === null || seen.has(idx)) continue;
        seen.add(idx);
        out.push({
          index: idx,
          status: idx === finalKey ? 'correct' : 'wrong',
          why: sanitize(item.why)
        });
      }
      return out.sort(function (a, b) { return a.index - b.index; });
    }

    let answerExplanation = writer ? sanitize(writer.answerExplanation) : '';
    let optionExplanations = writer ? normalizeOptionExplanations(writer.optionExplanations) : [];
    let criticPass = null;

    if (writer && answerExplanation && remaining() > 2500) {
      const criticPrompts = buildCriticPrompt({
        question: correctedQuestion,
        options: correctedOptions,
        keyIndex: finalKey,
        answerExplanation: answerExplanation,
        optionExplanations: optionExplanations
      });
      const critic = await callJSON(MODEL_PRIMARY, criticPrompts, { maxTokens: 900, temperature: 0 });
      if (critic) {
        const bad = Array.isArray(critic.badOptionIndexes)
          ? critic.badOptionIndexes.map(function (i) { return toIndex(i, options.length); }).filter(function (i) { return i !== null; })
          : [];
        criticPass = {
          pass: !!critic.pass,
          topicAligned: critic.topicAligned !== false,
          explainsFinalAnswer: critic.explainsFinalAnswer !== false,
          inventedDetail: !!critic.inventedDetail,
          badOptionIndexes: bad,
          issues: Array.isArray(critic.issues) ? critic.issues.map(clean).filter(Boolean) : []
        };

        const failed = !criticPass.pass || bad.length > 0 || criticPass.explainsFinalAnswer === false || criticPass.topicAligned === false;

        // retry-র আগের লেখাগুলো মনে রাখি — একই লেখা ফিরে এলে সেটা এখনো খারাপ
        const prevWhy = new Map();
        optionExplanations.forEach(function (o) { prevWhy.set(o.index, optionKey(o.why)); });
        let regenerated = false;

        // একবার মাত্র আবার লেখা — সমস্যাগুলো বলে দিয়ে
        if (failed && remaining() > 4000) {
          const retry = await callWithFallback(function () {
            return buildWriterPrompt({
              question: question,
              options: options,
              subject: subject,
              chapter: chapter,
              keyIndex: finalKey,
              facts: facts,
              issues: criticPass.issues
            });
          }, { maxTokens: 2600, temperature: 0.2 });
          if (retry.parsed) {
            regenerated = true;
            if (retry.model) usedModels.push(retry.model + ':retry');
            const nextExplanation = sanitize(retry.parsed.answerExplanation);
            const nextOptions = normalizeOptionExplanations(retry.parsed.optionExplanations);
            if (nextExplanation) answerExplanation = nextExplanation;
            if (nextOptions.length >= optionExplanations.length) optionExplanations = nextOptions;
          }
        }

        // যে অপশনগুলোর কারণ এখনো একই/খালি — সেগুলো সরিয়ে ফেলা (ভুল ব্যাখ্যার চেয়ে না থাকা ভালো)
        if (criticPass.badOptionIndexes.length) {
          const stillBad = new Set();
          for (const idx of criticPass.badOptionIndexes) {
            const found = optionExplanations.find(function (o) { return o.index === idx; });
            const after = found ? optionKey(found.why) : '';
            const before = prevWhy.get(idx);
            if (!regenerated || !after || after === before) stillBad.add(idx);
          }
          if (stillBad.size) {
            const beforeCount = optionExplanations.length;
            optionExplanations = optionExplanations.filter(function (o) { return !stillBad.has(o.index); });
            flags.push('explanation-trimmed');
            if (optionExplanations.length < beforeCount && !criticPass.issues.length) {
              criticPass.issues.push('কিছু অপশনের ব্যাখ্যা যাচাইয়ে টিকেনি, বাদ দেওয়া হয়েছে');
            }
          }
        }

        if (criticPass.topicAligned === false || criticPass.explainsFinalAnswer === false || criticPass.inventedDetail) {
          flags.push('explanation-unreliable');
          answerExplanation = '';
        }
      }
    }

    // writer ব্যর্থ হলে ন্যূনতম ব্যাখ্যা (পুরনো "✅ প্রশ্নটি সঠিক আছে" ফাঁকা লাইনের বদলে)
    if (!answerExplanation && !optionExplanations.length) {
      answerExplanation = 'এই প্রশ্নের সঠিক উত্তরটি যাচাই করা হয়েছে; ব্যাখ্যা তৈরি করা যায়নি, তাই বিস্তারিত ব্যাখ্যা বাদ দেওয়া হলো।';
      flags.push('explanation-missing');
    }

    const aiExplanation = composeExplanation({
      options: correctedOptions,
      keyIndex: finalKey,
      answerExplanation: answerExplanation,
      optionExplanations: optionExplanations,
      multiline: multiline
    });

    // ═══════════════════════════════════════════════════════════════════════
    // শীটে লেখা
    // ═══════════════════════════════════════════════════════════════════════
    const needsCorrection = keyChanged || formatChanged;
    // explanationMode: 'refresh' (ডিফল্ট) | 'auto' (ফাঁকা/placeholder নোট হলেই লেখে) | 'keep'
    const explanationMode = clean(body.explanationMode || process.env.CHECK_EXPLANATION_MODE || 'refresh');
    const existingNote = clean(body.note || body.currentExplanation || '');
    const looksPlaceholder = !existingNote
      || existingNote.length < 25
      || /✅ প্রশ্নটি সঠিক|প্রয়োজন নেই/.test(existingNote);
    let refreshExplanation;
    if (explanationMode === 'refresh') refreshExplanation = true;
    else if (explanationMode === 'keep') refreshExplanation = false;
    else refreshExplanation = looksPlaceholder || !!body.forceExplanation;
    // ব্যাখ্যা তৈরি করা যায়নি — তাহলে পুরনো নোট মুছে ফেলা ঠিক নয়
    if (flags.indexOf('explanation-missing') !== -1) refreshExplanation = false;

    let sheetUpdated = false;
    let sheetAction = 'none';

    if (rowIndex !== undefined && rowIndex !== null && quizType) {
      const scriptUrl = SCRIPT_URLS[quizType] || SCRIPT_URLS['ssc'];
      try {
        if (needsCorrection) {
          const sheetRes = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              rowIndex: rowIndex,
              type: 'correction',
              question: correctedQuestion,
              options: correctedOptions,
              correctAnswer: finalKey,
              aiExplanation: aiExplanation
            })
          });
          sheetUpdated = sheetRes.ok;
          sheetAction = 'correction';
        } else if (refreshExplanation) {
          // api/update-sheet.js-এর মতোই শুধু explanation সেলে লেখা
          const sheetRes = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rowIndex: rowIndex, explanation: aiExplanation })
          });
          sheetUpdated = sheetRes.ok;
          sheetAction = 'explanation';
        }
      } catch (e) {
        console.warn('Sheet update failed:', e && e.message);
      }
    }

    return res.status(200).json({
      // ── পুরনো contract (client এগুলোই পড়ে) ──
      needsCorrection: needsCorrection,
      correctedQuestion: correctedQuestion,
      correctedOptions: correctedOptions,
      correctAnswer: finalKey,
      aiExplanation: aiExplanation,
      sheetUpdated: sheetUpdated,
      usedModel: usedModels.join(' + ') || MODEL_PRIMARY,

      // ── নতুন diagnostic ──
      answerKeyStatus: status,
      keyChanged: keyChanged,
      previousAnswer: currentKey,
      verdictReason: verdictReason,
      backTest: backTest
        ? {
          verdict: clean(backTest.verdict),
          claim: clean(backTest.claim),
          test: clean(backTest.disproofTest),
          alternativeIndex: altIndex,
          confidence: refConfidence
        }
        : null,
      blindAnswer: blind.index,
      blindConfidence: solve ? Number(solve.confidence) || 0 : 0,
      reviewFlags: flags,
      optionExplanations: optionExplanations,
      critic: criticPass,
      explanationUpdated: refreshExplanation || needsCorrection,
      sheetAction: sheetAction,
      elapsedMs: Date.now() - startedAt
    });
  } catch (e) {
    console.error('Question check error:', e);
    return res.status(500).json({
      error: e && e.message ? e.message : 'unknown error',
      needsCorrection: false
    });
  }
}
