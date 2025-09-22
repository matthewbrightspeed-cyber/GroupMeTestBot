// server.js
import express from "express";

const app = express();
app.use(express.json());

const BOT_ID = process.env.GROUPME_BOT_ID;

// Send a message back to the GroupMe group as the bot
async function send(text) {
  await fetch("https://api.groupme.com/v3/bots/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_id: BOT_ID, text })
  });
}

// Parse any message text that includes "Customer Information"
function parseOrders(raw) {
  if (!raw || !/customer information/i.test(raw)) return [];

  // Split into blocks that start with "Customer Information:"
  const blocks = raw.split(/(?=Customer Information\s*:)/i);
  const results = [];

  for (const block of blocks) {
    if (!/Customer Information/i.test(block)) continue;

    // Capture first Name: ... in the block
    const nameMatch = block.match(/^\s*Name\s*:\s*(.+?)\s*$/im);

    // Capture the first Order Due Date: ... (accepts mm/dd/yyyy or yyyy-mm-dd)
    const dueMatch =
      block.match(/^\s*Order\s+Due\s+Date\s*:\s*((?:\d{1,2}\/\d{1,2}\/\d{4})|(?:\d{4}-\d{2}-\d{2}))\s*$/im) ||
      block.match(/^\s*Order\s+due\s+date\s*:\s*((?:\d{1,2}\/\d{1,2}\/\d{4})|(?:\d{4}-\d{2}-\d{2}))\s*$/im);

    if (nameMatch && dueMatch) {
      results.push({
        customer: nameMatch[1].trim(),
        due: dueMatch[1].trim(),
      });
    }
  }

  return results;
}

// Health check
app.get("/", (_, res) => res.send("OK"));

// This endpoint is your GroupMe bot "Callback URL"
app.post("/groupme/webhook", async (req, res) => {
  // ACK immediately so GroupMe doesn't retry
  res.sendStatus(200);

  const msg = req.body || {};

  // GroupMe posts include: text, name, sender_type, etc.
  // Ignore our own bot messages to avoid infinite loops
  if (msg.sender_type === "bot") return;

  const text = msg.text || "";
  const poster = msg.name || "Unknown";

  // Always run extraction automatically on *every* message
  const entries = parseOrders(text);

  // If nothing matched, do nothing (quiet) OR notify—your choice:
  if (entries.length === 0) return;

  // Build and send CSV rows
  let csv = "Sales Rep,Customer Name,Order Due Date\n";
  for (const e of entries) csv += `${poster},${e.customer},${e.due}\n`;

  // Keep within GroupMe text limits
  if (csv.length > 900) csv = csv.slice(0, 850) + "\n...[truncated]";

  await send(csv);
});

app.listen(process.env.PORT || 8080, () => {
  console.log("GroupMe bot is listening for POSTs at /groupme/webhook");
});
