const { ChatAnthropic } = require('@langchain/anthropic');
const { createReactAgent } = require('@langchain/langgraph/prebuilt');
const { HumanMessage, AIMessage, SystemMessage } = require('@langchain/core/messages');
const { getSalesSummary, getTopSKUs } = require('./tools');

const llm = new ChatAnthropic({
  model: 'claude-sonnet-4-6',
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const tools = [getSalesSummary, getTopSKUs];

const agent = createReactAgent({ llm, tools });

const SYSTEM_PROMPT = `You are a helpful CRM sales assistant with access to live sales data from the Sales collection.

Tools available:
- getSalesSummary: aggregated totals grouped by status (new, pending, won, lost, cancelled). Returns order count, quantity, revenue, and cost. Use for pipeline overview or status breakdowns.
- getTopSKUs: ranks SKUs by revenue, quantity, or order count. Returns SKU code, product name, quantity, revenue, and cost. Use for any question about best-selling products, top SKUs, or product performance. Optional filters: date range, platform, warehouse.

Always call the appropriate tool before answering — never guess at numbers.
For date ranges, convert relative terms (e.g. "last month", "June", "Q1 2025") to ISO 8601 dates before calling tools.
Present results clearly. Always include the SKU code in your answer when answering SKU questions.`;

async function runChat(message, history = []) {
  const messages = [new SystemMessage(SYSTEM_PROMPT)];

  for (const msg of history) {
    if (msg.role === 'user') messages.push(new HumanMessage(msg.content));
    else if (msg.role === 'assistant') messages.push(new AIMessage(msg.content));
  }

  messages.push(new HumanMessage(message));

  const result = await agent.invoke({ messages });

  const lastMessage = result.messages[result.messages.length - 1];
  return lastMessage.content;
}

module.exports = { runChat };
