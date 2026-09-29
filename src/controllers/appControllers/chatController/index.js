const { runChat } = require('./agent');

const FRIENDLY_ERRORS = {
  'credit balance is too low': 'The AI service is currently unavailable (insufficient API credits). Please contact your administrator.',
  'invalid_api_key': 'The AI service is misconfigured (invalid API key). Please contact your administrator.',
  'overloaded': 'The AI service is temporarily overloaded. Please try again in a moment.',
};

function friendlyMessage(err) {
  const text = (err.message || '').toLowerCase();
  for (const [key, msg] of Object.entries(FRIENDLY_ERRORS)) {
    if (text.includes(key)) return msg;
  }

  return 'Sorry, I encountered an error processing your request. Please try again.';
}

async function chat(req, res) {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ success: false, result: null, message: 'Message is required' });
  }

  try {
    const reply = await runChat(message.trim(), Array.isArray(history) ? history : []);
    return res.status(200).json({ success: true, result: { reply }, message: 'Chat response generated' });
  } catch (err) {
    return res.status(200).json({ success: true, result: { reply: friendlyMessage(err) }, message: 'Chat response generated' });
  }
}

module.exports = { chat };
