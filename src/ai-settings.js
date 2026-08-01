import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_FILE = path.join(__dirname, "../data/ai-settings.json");

const TEXT_PROVIDERS = ["openai", "gemini", "groq", "xai"];
const IMAGE_PROVIDERS = [
  "gemini",
  "openai",
  "xai",
  "seadream",
  "leonardo",
  "pollinations",
];
const VISION_PROVIDERS = ["openai", "gemini", "groq", "xai"];

export const DEFAULT_AI_SETTINGS = Object.freeze({
  textOrder: ["openai", "gemini", "groq", "xai"],
  visionOrder: ["openai", "gemini", "groq", "xai"],
  imageOrder: ["gemini", "openai", "xai", "seadream", "leonardo", "pollinations"],
  memoryTurns: 10,
  temperature: 0.8,
  customInstruction: "",
  textModels: {
    openai: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol",
    gemini: process.env.GEMINI_TEXT_MODEL || "gemini-3.6-flash",
    groq: process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile",
    xai: process.env.XAI_TEXT_MODEL || "grok-4.3",
  },
  visionModels: {
    openai: process.env.OPENAI_VISION_MODEL || "gpt-5.6-sol",
    gemini: process.env.GEMINI_VISION_MODEL || "gemini-3.6-flash",
    groq: process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b",
    xai: process.env.XAI_VISION_MODEL || "grok-4.5",
  },
  imageModels: {
    gemini: process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image",
    openai: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    xai: process.env.XAI_IMAGE_MODEL || "grok-imagine-image",
    seadream: process.env.SEADREAM_IMAGE_MODEL || "dola-seedream-5-0-pro-260628",
    leonardo: process.env.LEONARDO_IMAGE_MODEL || "b24e16ff-06e3-43eb-8d33-4416c2d75876",
  },
});

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_AI_SETTINGS));
}

function normalizeOrder(value, allowed, fallback) {
  const raw = Array.isArray(value)
    ? value
    : String(value || "").split(",");
  const cleaned = raw
    .map(item => String(item).trim().toLowerCase())
    .filter((item, index, values) => allowed.includes(item) && values.indexOf(item) === index);
  return cleaned.length ? cleaned : [...fallback];
}

function normalizeModelMap(value, defaults) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(
    Object.entries(defaults).map(([provider, fallback]) => {
      const model = String(source[provider] || fallback).trim().slice(0, 120);
      return [provider, model || fallback];
    })
  );
}

export function normalizeAISettings(value = {}) {
  const defaults = cloneDefaults();
  const source = value && typeof value === "object" ? value : {};
  const memoryTurns = Number.parseInt(source.memoryTurns, 10);
  const temperature = Number.parseFloat(source.temperature);

  return {
    textOrder: normalizeOrder(source.textOrder, TEXT_PROVIDERS, defaults.textOrder),
    visionOrder: normalizeOrder(source.visionOrder, VISION_PROVIDERS, defaults.visionOrder),
    imageOrder: normalizeOrder(source.imageOrder, IMAGE_PROVIDERS, defaults.imageOrder),
    memoryTurns: Number.isFinite(memoryTurns) ? Math.min(50, Math.max(0, memoryTurns)) : defaults.memoryTurns,
    temperature: Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : defaults.temperature,
    customInstruction: String(source.customInstruction || "").trim().slice(0, 4000),
    textModels: normalizeModelMap(source.textModels, defaults.textModels),
    visionModels: normalizeModelMap(source.visionModels, defaults.visionModels),
    imageModels: normalizeModelMap(source.imageModels, defaults.imageModels),
  };
}

export function getAISettings() {
  if (!fs.existsSync(SETTINGS_FILE)) return cloneDefaults();
  try {
    return normalizeAISettings(JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")));
  } catch (error) {
    console.warn(`[AI SETTINGS] Gagal membaca pengaturan: ${error.message}`);
    return cloneDefaults();
  }
}

export function updateAISettings(changes = {}) {
  const current = getAISettings();
  const next = normalizeAISettings({
    ...current,
    ...changes,
    textModels: { ...current.textModels, ...(changes.textModels || {}) },
    visionModels: { ...current.visionModels, ...(changes.visionModels || {}) },
    imageModels: { ...current.imageModels, ...(changes.imageModels || {}) },
  });

  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  const temporary = `${SETTINGS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(temporary, SETTINGS_FILE);
  return next;
}
