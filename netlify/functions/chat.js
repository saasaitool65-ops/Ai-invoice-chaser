// ============================================================
// netlify/functions/chat.js — Gemini AI Backend (Netlify Function)
// Yeh file /api/chat pe automatically backend ban jaati hai
// Gemini key sirf Netlify environment mein hoti hai — safe!
// ============================================================

exports.handler = async function (event, context) {
  // Only POST allowed
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // OPTIONS preflight (browser CORS check)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  try {
    const { prompt, tone, invoiceData } = JSON.parse(event.body || '{}');

    if (!prompt && !invoiceData) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'prompt or invoiceData required' }),
      };
    }

    // Build prompt from invoiceData if sent directly
    const finalPrompt = prompt || buildPrompt(invoiceData, tone);

    // ✅ GEMINI_KEY — Netlify Dashboard mein daalo
    // Site Settings → Environment Variables → GEMINI_KEY
    // Google AI Studio se key lo: https://aistudio.google.com/apikey
    const GEMINI_KEY = process.env.GEMINI_KEY;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: finalPrompt }] }],
          generationConfig: {
            maxOutputTokens: 400,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return {
        statusCode: response.status,
        headers: corsHeaders(),
        body: JSON.stringify({ error: err.error?.message || 'Gemini API error' }),
      };
    }

    const geminiData = await response.json();

    // Gemini response ko Anthropic-style format mein convert karo
    // Taaki frontend code change na karna pade
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const data = {
      content: [{ type: 'text', text }],
    };

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('Chat function error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

// CORS headers helper
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

// Helper — prompt builder
function buildPrompt(inv, tone) {
  const toneMap = {
    friendly: 'warm, friendly and understanding. Like a colleague reminding a friend. Polite, no pressure.',
    professional: 'professional, formal and businesslike. Clear and respectful.',
    firm: 'firm, direct and serious. Make the urgency absolutely clear.',
  };
  return `Write an invoice follow-up email. Respond ONLY in this exact format:\nSUBJECT: [subject line]\nBODY:\n[email body]\n\nDetails:\n- Client: ${inv.client}\n- Invoice: ${inv.invno}\n- Amount: $${Number(inv.amount).toLocaleString()}\n- Days overdue: ${inv.daysOverdue}\n- Service: ${inv.desc || 'professional services'}\n- Payment link: ${inv.paylink || '(not provided)'}\n- Reminder number: ${inv.sent + 1}\n- Tone: ${toneMap[tone] || toneMap.friendly}\n\nRules: Under 110 words. Use actual values. Sign as: Best regards, [Your Name]`;
}
