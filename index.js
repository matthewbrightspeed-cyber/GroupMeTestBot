// server.js
import express from "express";

const app = express();
app.use(express.json());

const BOT_ID = process.env.GROUPME_BOT_ID;

// Use Node 18+ global fetch (no extra deps)
async function send(text) {
  await fetch("https://api.groupme.com/v3/bots/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_id: BOT_ID, text })
  });
}

// Extract Name + Order Due Date lines from "Customer Information" blocks
function parseOrders(raw) {
  if (!raw || !/customer information/i.test(raw)) return [];
  const blocks = raw.split(/(?=Customer Information\s*:)/i);
  const results = [];
  for (const block of blocks) {
    if (!/Customer Information/i.test(block)) continue;
    const nameMatch = block.match(/^\s*Name\s*:\s*(.+?)\s*$/im);
    const dueMatch = block.match(/^\s*Order\s+Due\s+Date\s*:\s*([0-9]{1,2}\/([0-9]{1,2}\/([0-9]{4}))\s*$/im);
    if (nameMatch && dueMatch) {
      results.push({ customer: nameMatch[1].trim(), due: dueMatch[1].trim() });
    }
  }
  return results;
}

app.get("/", (req, res) => res.send("OK")); // simple health check

app.post("/groupme/webhook", async (req, res) => {
  res.sendStatus(200); // ack fast

  const msg = req.body || {};
  if (msg.sender_type === "bot") return; // avoid loops

  const text = msg.text || "";
  const postedBy = msg.name || "Unknown";

  if (!/customer information/i.test(text)) return;

  const entries = parseOrders(text);
  if (entries.length === 0) {
    await send(`No orders found in that message, ${postedBy}. Make sure it includes "Customer Information", "Name:", and "Order Due Date:".`);
    return;
  }

  let csv = "Sales Rep,Customer Name,Order Due Date\n";
  for (const e of entries) csv += `${postedBy},${e.customer},${e.due}\n`;

  if (csv.length > 900) csv = csv.slice(0, 850) + "\n...[truncated]";
  await send(csv);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Bot listening");
});
