
const crypto = require('crypto');

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

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

    const finalPrompt = prompt || buildPrompt(invoiceData, tone);
    const GEMINI_KEY = process.env.GEMINI_KEY;

    if (!GEMINI_KEY) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'GEMINI_KEY not configured' }),
      };
    }

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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function buildPrompt(inv, tone) {
  const toneMap = {
    friendly: 'warm, friendly and understanding. Like a colleague reminding a friend. Polite, no pressure.',
    professional: 'professional, formal and businesslike. Clear and respectful.',
    firm: 'firm, direct and serious. Make the urgency absolutely clear.',
  };
  return `Write an invoice follow-up email. Respond ONLY in this exact format:\nSUBJECT: [subject line]\nBODY:\n[email body]\n\nDetails:\n- Client: ${inv.client}\n- Invoice: ${inv.invno}\n- Amount: $${Number(inv.amount).toLocaleString()}\n- Days overdue: ${inv.daysOverdue}\n- Service: ${inv.desc || 'professional services'}\n- Payment link: ${inv.paylink || '(not provided)'}\n- Reminder number: ${inv.sent + 1}\n- Tone: ${toneMap[tone] || toneMap.friendly}\n\nRules: Under 110 words. Use actual values. Sign as: Best regards, [Your Name]`;
  }
