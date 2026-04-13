const viewerKey = "mcp_a607d6bc-e555-4640-bd08-75c64c3f21c7_c9ba6d73d143105829b342494ebe52b1";
const endpoint = "http://localhost:8888/api/mcp";

async function testViewer() {
  console.log(`\n--- Testing Decoupled Viewer Key ---`);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "x-mcp-key": viewerKey
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: "query_assistant",
          arguments: { prompt: "Create an account named 'Final RBAC' with category 'expense' and ID 'final-rbac'" }
        }
      })
    });

    const text = await response.text();
    console.log(`Status: ${response.status}`);
    console.log("Raw Response Text:", text);
    
    if (text.includes("Forbidden") || text.includes("Viewers cannot perform")) {
      console.log("RESULT: Success (Strictly Blocked)");
    } else {
      console.log("RESULT: Failed (Still Bypassed)");
    }
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testViewer();
