const { ChatAnthropic } = require('@langchain/anthropic');
const { createReactAgent } = require('@langchain/langgraph/prebuilt');
const { HumanMessage, AIMessage, SystemMessage } = require('@langchain/core/messages');
const {
  getSalesSummary,
  getTopSKUs,
  getInventory,
  getProducts,
  getPlatforms,
  getSkuCosts,
  getCustomers,
} = require('./tools');

const tools = [
  getSalesSummary,
  getTopSKUs,
  getInventory,
  getProducts,
  getPlatforms,
  getSkuCosts,
  getCustomers,
];

let agent;
function getAgent() {
  if (!agent) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    const llm = new ChatAnthropic({
      model: 'claude-opus-4-7',
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    agent = createReactAgent({ llm, tools });
  }
  return agent;
}

const SYSTEM_PROMPT = `You are a helpful ERP sales assistant with access to live operational data (sales, inventory, products, customers, platforms, and SKU costs).

Tools available:
- getSalesSummary: aggregated totals grouped by status (new, pending, won, lost, cancelled). Returns order count, quantity, revenue, cost, and gross profit. Use for pipeline overview or status breakdowns.
- getTopSKUs: ranks SKUs by revenue, quantity, or order count. Returns SKU code, product name, orders, quantity, revenue, and cost. Optional filters: date range, platform, warehouse_location. Use for best-selling / top-performing SKU questions.
- getInventory: current stock levels per SKU. Totals across all warehouses by default; pass a warehouse to get per-warehouse stock + on_the_way (in-transit). Supports low_stock_only. Use for stock checks and warehouse comparisons.
- getProducts: product catalog metadata (name, package dimensions and weight, 40ft container qty, procurement price, factory). Use for product spec, shipping, or sourcing questions.
- getPlatforms: list of sales platforms configured in Shop Settings, with fee_rate, fee_fixed, and monthly_fee. Use to answer platform/fee questions or to validate a platform name before calling getTopSKUs or getSalesSummary.
- getSkuCosts: per-SKU cost history (date_from → date_to windows). Supports at_date for point-in-time lookup. Use for cost-trend or margin questions.
- getCustomers: customers (clients) by name/country, with a by-country count summary built in. Use for customer counts, regional distribution, or to find a customer before cross-referencing sales.

Reasoning rules:
- Always call the appropriate tool before answering — never guess at numbers.
- For date ranges, convert relative terms (e.g. "last month", "June", "Q1 2025") to ISO 8601 dates before calling tools.
- For regional questions ("sales in NSW", "customers in Sydney"), use getCustomers to find matching customers first, then report findings. Fall back to acknowledging the limitation if the data cannot be fully linked.
- For profitability questions, combine getTopSKUs (revenue, cost) with getSkuCosts if a cost correction is needed.
- Present results clearly. Always include the SKU code when answering SKU questions, and show currency and units explicitly.`;

async function runChat(message, history = []) {
  const messages = [new SystemMessage(SYSTEM_PROMPT)];

  for (const msg of history) {
    if (msg.role === 'user') messages.push(new HumanMessage(msg.content));
    else if (msg.role === 'assistant') messages.push(new AIMessage(msg.content));
  }

  messages.push(new HumanMessage(message));

  const result = await getAgent().invoke({ messages });

  const lastMessage = result.messages[result.messages.length - 1];
  return lastMessage.content;
}

module.exports = { runChat };
