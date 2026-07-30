// test.js - Test semua module bot
import dotenv from "dotenv";
dotenv.config();

console.log("🧪 Testing Bot Abel Modules...\n");

// Test 1: Handler
try {
  const { handleMessage, handleGroupUpdate } = await import("./src/handler.js");
  console.log("✅ handler.js  - OK");
} catch (e) {
  console.error("❌ handler.js  - ERROR:", e.message);
}

// Test 2: AI
try {
  const { chatAI, resetAI } = await import("./src/ai.js");
  console.log("✅ ai.js       - OK");
  
  // Test Gemini API key
  console.log("   🔑 Testing Gemini API...");
  const balasan = await chatAI("test123", "halo, siapa kamu?");
  console.log("   🤖 Respon AI:", balasan.slice(0, 80) + "...");
} catch (e) {
  console.error("❌ ai.js       - ERROR:", e.message);
}

// Test 3: Menu
try {
  const { menuUtama } = await import("./src/menu.js");
  const menu = menuUtama(false);
  console.log("✅ menu.js     - OK (" + menu.length + " chars)");
} catch (e) {
  console.error("❌ menu.js     - ERROR:", e.message);
}

// Test 4: Group
try {
  const { welcomeMessage, cekSpam } = await import("./src/group.js");
  const pesan = welcomeMessage("TestUser", "Test Grup");
  console.log("✅ group.js    - OK");
} catch (e) {
  console.error("❌ group.js   - ERROR:", e.message);
}

// Test 5: Broadcast
try {
  const broadcast = await import("./src/broadcast.js");
  console.log("✅ broadcast.js - OK");
} catch (e) {
  console.error("❌ broadcast.js - ERROR:", e.message);
}

console.log("\n✅ Test selesai!");
