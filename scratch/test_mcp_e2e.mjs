
const API_URL = "http://localhost:8888/api/mcp";
const API_KEY = "mcp_a607d6bc-e555-4640-bd08-75c64c3f21c7_9c4551798e047236d59e7af99a9b8fd3";
let stepNum = 0;

// Low-level JSON-RPC call
const rpc = async (method, params = {}) => {
  stepNum++;
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "x-mcp-key": API_KEY,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: stepNum, method, params }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`  ❌ HTTP ${res.status}: ${text}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    // Streamed response lines
    const lines = text.split("\n").filter(l => l.startsWith("data:"));
    return { raw: lines.map(l => l.slice(5).trim()) };
  }
};

// Extract text from an MCP result or raw SSE lines
const extractText = (res) => {
  if (!res) return null;
  const content = res?.result?.content;
  if (Array.isArray(content)) return content.map(c => c.text || "").join("");
  if (res?.raw) {
    for (const line of res.raw) {
      try {
        const parsed = JSON.parse(line);
        const c = parsed?.result?.content;
        if (Array.isArray(c)) return c.map(x => x.text || "").join("");
        if (parsed?.error) return `RPC Error: ${JSON.stringify(parsed.error)}`;
      } catch {}
    }
  }
  if (res?.error) return `RPC Error: ${JSON.stringify(res.error)}`;
  return JSON.stringify(res).slice(0, 300);
};

const ask = async (label, prompt) => {
  console.log(`\n[${label}]`);
  console.log(`  > ${prompt}`);
  const res = await rpc("tools/call", { name: "query_assistant", arguments: { prompt } });
  const text = extractText(res);
  if (text) {
    console.log(`  ✅ ${text.slice(0, 600)}`);
  } else {
    console.log(`  ⚠️  No content in response`);
  }
};

const run = async () => {
  console.log("=== SULFUR MCP END-TO-END TEST ===");
  console.log(`Endpoint: ${API_URL}\n`);

  // Step 0: List tools
  console.log("[0] Listing available tools...");
  const toolsRes = await rpc("tools/list");
  const tools = toolsRes?.result?.tools || (toolsRes?.raw ? (() => {
    try { return JSON.parse(toolsRes.raw[0])?.result?.tools; } catch { return null; }
  })() : null);
  if (tools) {
    console.log(`  ✅ Tools registered: ${tools.map(t => t.name).join(", ")}`);
  } else {
    console.log("  ⚠️ Could not parse tools list. Raw:", JSON.stringify(toolsRes).slice(0, 300));
  }

  // Step 1: Balance query
  await ask("1 - Balance Query", "What accounts do I have and what are their current balances?");

  // Step 2: Record a real transaction using known accounts
  await ask("2 - Record Transaction", "Record a 55 euro expense for groceries from Cash Wallet to Grocery bill account.");

  // Step 3: Create a recurring entry
  await ask("3 - Recurring Entry", "Set up a monthly recurring transaction: 1000 euro from City Bank to Internet Bill, starting from today.");

  // Step 4: Financial report
  await ask("4 - Financial Report", "Give me a summary of all expenses this month.");

  // Step 5: Cancel the recurring entry
  await ask("5 - Cancel Recurring", "List all my recurring entries and then cancel the Internet Bill recurring one.");

  console.log("\n=== TEST COMPLETE ===");
};

run().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
