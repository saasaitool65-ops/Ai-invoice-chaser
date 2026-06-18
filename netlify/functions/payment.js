const crypto = require('crypto');

exports.handler = async function (event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

  if (!KEY_ID || !KEY_SECRET) {
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Razorpay keys not configured' }),
    };
  }

  const action = event.queryStringParameters?.action;

  if (action === 'create') {
    try {
      const { plan, userEmail, userName } = JSON.parse(event.body || '{}');

      const planPrices = {
        pro_monthly:  2900,
        pro_6month:   2500 * 6,
        pro_yearly:   2000 * 12,
        biz_monthly:  7900,
        biz_6month:   6700 * 6,
        biz_yearly:   5500 * 12,
        pro:      2900,
        business: 7900,
        annual:   1900,
      };

      const amount = planPrices[plan];
      if (!amount) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Invalid plan' }),
        };
      }

      const authHeader = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amount * 100,
          currency: 'USD',
          receipt: `receipt_${plan}_${Date.now()}`,
          notes: {
            plan,
            userEmail: userEmail || '',
            userName: userName || '',
          },
        }),
      });

      if (!rzpRes.ok) {
        const err = await rzpRes.json();
        return {
          statusCode: rzpRes.status,
          headers: corsHeaders(),
          body: JSON.stringify({ error: err.error?.description || 'Order creation failed' }),
        };
      }

      const order = await rzpRes.json();

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          key_id: KEY_ID,
          plan,
        }),
      };
    } catch (err) {
      console.error('Order create error:', err);
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Failed to create order' }),
      };
    }
  }

  if (action === 'verify') {
    try {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        plan,
        userId,
      } = JSON.parse(event.body || '{}');

      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expected = crypto
        .createHmac('sha256', KEY_SECRET)
        .update(body)
        .digest('hex');

      if (expected !== razorpay_signature) {
        return {
          statusCode: 400,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Invalid payment signature' }),
        };
      }

      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({
          success: true,
          payment_id: razorpay_payment_id,
          order_id: razorpay_order_id,
          plan,
          userId,
        }),
      };
    } catch (err) {
      console.error('Verify error:', err);
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Verification failed' }),
      };
    }
  }

  return {
    statusCode: 400,
    headers: corsHeaders(),
    body: JSON.stringify({ error: 'Invalid action. Use ?action=create or ?action=verify' }),
  };
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
    }
