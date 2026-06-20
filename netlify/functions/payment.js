// ============================================================
// netlify/functions/payment.js — Gumroad Webhook Handler
// Gumroad "Ping" (webhook) ko receive karta hai jab koi payment
// successful hoti hai, aur Firestore mein user ka plan activate
// karta hai.
//
// SETUP:
// 1. Gumroad Dashboard → Settings → Advanced → Ping URL
//    Wahan yeh URL daalo: https://YOURSITE.netlify.app/api/payment
// 2. Har product ke checkout link mein humne already user_id, email,
//    current_plan bhej diya hota hai (index.html ke
//    openGumroadCheckout() function se).
// 3. Netlify Environment Variables mein yeh daalo:
//    GUMROAD_PRODUCT_PLAN_MAP = JSON string mapping product permalinks
//    se plan keys, e.g.
//    {"pro-monthly":"pro_monthly","pro-6month":"pro_6month",...}
//    FIREBASE_SERVICE_ACCOUNT = poora Firebase Admin SDK service
//    account JSON (Firebase Console → Project Settings → Service
//    Accounts → Generate new private key) as a single-line string.
// ============================================================

const admin = require('firebase-admin');

let firebaseApp;
function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcJson) throw new Error('FIREBASE_SERVICE_ACCOUNT not configured');
  const serviceAccount = JSON.parse(svcJson);
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  return firebaseApp;
}

// Maps Gumroad product permalink (the part after /l/) to our internal plan key.
// Default mapping assumes product permalinks match the plan key with
// underscores replaced by hyphens (pro_monthly -> pro-monthly).
function resolvePlanFromPermalink(permalink) {
  if (!permalink) return null;
  const mapJson = process.env.GUMROAD_PRODUCT_PLAN_MAP;
  if (mapJson) {
    try {
      const map = JSON.parse(mapJson);
      if (map[permalink]) return map[permalink];
    } catch (e) {
      console.error('Invalid GUMROAD_PRODUCT_PLAN_MAP:', e.message);
    }
  }
  // fallback: convert hyphens back to underscores
  return permalink.replace(/-/g, '_');
}

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

  try {
    // Gumroad sends application/x-www-form-urlencoded by default
    const params = new URLSearchParams(event.body || '');
    const data = Object.fromEntries(params.entries());

    // Basic sanity check — Gumroad always sends these on a successful sale
    if (!data.sale_id || !data.product_permalink) {
      console.error('Gumroad ping missing expected fields:', data);
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Invalid Gumroad payload' }),
      };
    }

    // refunded / disputed pings also hit this same URL — skip those
    if (data.refunded === 'true' || data.disputed === 'true') {
      console.log('Refund/dispute ping received — not activating plan:', data.sale_id);
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true, skipped: 'refund_or_dispute' }) };
    }

    const userId = data['url_params[user_id]'] || data.user_id;
    const email = data.email;
    const plan = resolvePlanFromPermalink(data.product_permalink);

    if (!plan) {
      console.error('Could not resolve plan for permalink:', data.product_permalink);
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Unknown product' }),
      };
    }

    getFirebaseApp();
    const db = admin.firestore();

    let docId = userId;

    // Fallback: if user_id wasn't passed through the checkout URL for
    // some reason, try to find the user by email instead.
    if (!docId && email) {
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        docId = userRecord.uid;
      } catch (e) {
        console.error('Could not find Firebase user by email:', email);
      }
    }

    if (!docId) {
      console.error('No user_id or matching email — cannot activate plan. Sale:', data.sale_id);
      return {
        statusCode: 200, // 200 so Gumroad doesn't keep retrying forever
        headers: corsHeaders(),
        body: JSON.stringify({ ok: true, warning: 'no_matching_user' }),
      };
    }

    await db.collection('user_plans').doc(docId).set(
      {
        user_id: docId,
        plan,
        desired_plan: plan,
        status: 'active',
        gumroad_sale_id: data.sale_id,
        gumroad_subscription_id: data.subscription_id || null,
        updated_at: new Date().toISOString(),
      },
      { merge: true }
    );

    console.log(`Activated plan "${plan}" for user ${docId} (sale ${data.sale_id})`);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ ok: true, plan, user_id: docId }),
    };
  } catch (err) {
    console.error('Gumroad webhook error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Webhook processing failed' }),
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
          }        razorpay_signature,
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
