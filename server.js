import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import expressWs from 'express-ws'; // Import express-ws
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import knex from 'knex';
import cors from 'cors';
import { google } from 'googleapis';
import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWebSocket } from './websocket_board.js'
import { Server } from 'socket.io';
import Stripe from 'stripe';
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
import sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { v4 as uuidv4 } from 'uuid';
import url from 'url';

import session from 'express-session';
const PgSessionStore = require('connect-pg-simple')(session);

/*
import classesRouter from '/routes/classes.js';
import assignmentsRouter from './routes/assignments.js';
import syncRouter from './routes/sync.js';
*/

const ALLOWED_RETURN_URLS = [
  'http://127.0.0.1:3000/auth/callback',
];

const allowedOrigins = [
  'https://a1dos-creations.com',
  'https://a1dos-login.onrender.com',
  'https://api.a1dos-creations.com',
  'chrome-extension://bilnakhjjjkhhhdlcajijkodkhmanfbg',
  'chrome-extension://bilnakhjjjkhhhdlcajijkodkhmanfbg',
  'chrome-extension://pafdkffolelojifgeepmjjofdendeojf',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://192.168.70.1:3000',
  'http://127.0.0.1:53030',
  'https://whiteboard.a1dos-creations.com/',
  'wss://api.a1dos-creations.com',
];

const app = express();
app.use(cors({
  origin: function (origin, callback) {

      if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
      } else {
          console.error(`CORS Error: Origin "${origin}" not in allowed list.`); // Log denied origins
          callback(new Error('Not allowed by CORS'));
      }
  },
  methods: ['GET', 'POST'], // Specify allowed methods
  allowedHeaders: ['Content-Type', 'Authorization', 'x-client-source'], // Specify allowed headers
  optionsSuccessStatus: 200
}));
app.use(express.json());

app.use(session({
  store: new PgSessionStore({
    conString: process.env.DATABASE_URL
  }),
  secret: process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
}));

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

app.get('/upcoming-streams', async (req, res) => {
   if (!YOUTUBE_API_KEY || !YOUTUBE_CHANNEL_ID) {
        return res.status(500).json({ message: 'API key or Channel ID not configured on server.' });
    }
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=<span class="math-inline">\{YOUTUBE\_CHANNEL\_ID\}&eventType\=upcoming&type\=video&key\=</span>{YOUTUBE_API_KEY}&maxResults=5`;

    try {
        const response = await axios.get(url);
        // We only need to send the video IDs and basic snippet info initially
        const upcomingStreams = response.data.items.map(item => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            thumbnailUrl: item.snippet.thumbnails.high.url // Or another resolution
        }));
        res.json(upcomingStreams);
    } catch (error) {
        console.error('Error fetching upcoming streams from YouTube API:', error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: 'Failed to fetch upcoming streams',
            error: error.response ? error.response.data.error.message : 'Server error'
        });
    }
});

app.get('/stream-details/:videoId', async (req, res) => {
    const { videoId } = req.params;
    if (!YOUTUBE_API_KEY) {
        return res.status(500).json({ message: 'API key not configured on server.' });
    }
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=<span class="math-inline">\{videoId\}&key\=</span>{YOUTUBE_API_KEY}`;

    try {
        const response = await axios.get(url);
        if (response.data.items && response.data.items.length > 0) {
            res.json(response.data.items[0]);
        } else {
            res.status(404).json({ message: 'Stream details not found for video ID: ' + videoId });
        }
    } catch (error) {
        console.error(`Error fetching stream details for ${videoId} from YouTube API:`, error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            message: 'Failed to fetch stream details',
            error: error.response ? error.response.data.error.message : 'Server error'
        });
    }
});

app.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Expecting "Bearer TOKEN"

  if (token == null) {
      return res.status(401).json({ success: false, message: 'Authentication token is required.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, userPayload) => {
      if (err) {
          console.error('JWT Verification Error:', err.message);
          return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
      }
      // The 'userPayload' should contain the user's ID (e.g., as 'id' or 'userId')
      // This depends on how you create your JWT upon login.
      // Assuming payload has { id: userId, email: userEmail, ... }
      req.user = userPayload; // Make user info available in request object
      next();
  });
};

/*
app.use('/api', classesRouter);
app.use('/api', assignmentsRouter);
app.use('/api', syncRouter);
*/

//const wss = new WebSocketServer({ port: 9999, noServer: true, path: '/ws' });
const server = http.createServer(app);
const wss = setupWebSocket(server);

server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  console.log('Upgrade request origin:', origin);
  wss.handleUpgrade(request, socket, head, ws => {
    ws.upgradeReq = request;
    ws.upgradeReq.headers.origin = origin;

    wss.emit('connection', ws, request);
  });
});

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});

const JWT_SECRET = process.env.JWT_SECRET;

import crypto from 'crypto';
import movieRouter from './routes/movies.js';
import rsvpRouter from './routes/rsvp.js';
import rsvpDataRouter from './routes/rsvp-data.js';

app.use('/movie/rsvp', rsvpRouter);
app.use('/movie', movieRouter);
app.use('/movies', rsvpDataRouter);

/*
app.use((req, res) => {
  res.status(404).send("Page not found");
});*/

// --- Stripe Webhook Handler ---
async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`Received Stripe event: ${event.type}`);
  let session, customerId, userEmailFromStripe, clientReferenceId, subscription, userId, recipientEmail;

  switch (event.type) {
      case 'checkout.session.completed':
          session = event.data.object;
          customerId = session.customer;
          userEmailFromStripe = session.customer_details?.email;
          clientReferenceId = session.client_reference_id; // Your internal user ID

          if (!customerId) {
              console.error('[checkout.session.completed] Customer ID not found.');
              return res.status(400).send('Customer ID missing.');
          }
          break;

      case 'invoice.payment_succeeded':
          session = event.data.object;
          customerId = session.customer;
          userEmailFromStripe = session.customer_email;
          if (session.billing_reason === 'subscription_create' || session.billing_reason === 'subscription_cycle') {
               // This is a subscription payment
          } else {
              console.log(`[invoice.payment_succeeded] Not a subscription-related payment reason: ${session.billing_reason}. Skipping code generation.`);
              return res.status(200).send('Event received, but not a subscription trigger for code.');
          }
          break;

      case 'customer.subscription.deleted':
          subscription = event.data.object;
          customerId = subscription.customer;
          try {
              const userResult = await pool.query('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);
              if (userResult.rowCount > 0) {
                  userId = userResult.rows[0].id;
                  await pool.query('UPDATE users SET is_premium = FALSE WHERE id = $1', [userId]);
                  console.log(`User ID ${userId} premium status revoked due to subscription deletion (Stripe Customer ID: ${customerId}).`);
              } else {
                  console.warn(`Subscription deleted for Stripe Customer ID ${customerId}, but no matching user found in DB.`);
              }
          } catch (err) {
              console.error('Error handling subscription deletion:', err);
          }
          return res.status(200).send('Subscription deletion processed.');

      default:
          console.log(`Unhandled event type ${event.type}.`);
          return res.status(200).send(`Unhandled event type: ${event.type}`);
  }

  if (!customerId) {
       console.log("No customer ID, skipping further processing for this event.");
       return res.status(200).send("No customer ID for further processing.");
  }

  try {
      if (clientReferenceId) {
          const userQuery = await pool.query('SELECT id, email FROM users WHERE id = $1', [clientReferenceId]);
          if (userQuery.rowCount > 0) {
              userId = userQuery.rows[0].id;
              recipientEmail = userQuery.rows[0].email;
              await pool.query(
                  'UPDATE users SET stripe_customer_id = $1 WHERE id = $2 AND (stripe_customer_id IS NULL OR stripe_customer_id != $1)',
                  [customerId, userId]
              );
          }
      } else if (userEmailFromStripe) {
          const userQuery = await pool.query(
              `INSERT INTO users (email, stripe_customer_id)
               VALUES ($1, $2)
               ON CONFLICT (email) DO UPDATE
               SET stripe_customer_id = EXCLUDED.stripe_customer_id, updated_at = NOW()
               WHERE users.stripe_customer_id IS NULL OR users.stripe_customer_id != EXCLUDED.stripe_customer_id
               RETURNING id, email`,
              [userEmailFromStripe, customerId]
          );
          if (userQuery.rowCount > 0) {
              userId = userQuery.rows[0].id;
              recipientEmail = userQuery.rows[0].email;
              console.log(`User ${userId} (${recipientEmail}) found/created/updated with Stripe customer ID ${customerId}.`);
          }
      }

      if (!userId || !recipientEmail) {
          console.error(`User could not be definitively identified or created for Stripe customer ${customerId}. Code not generated.`);
          return res.status(404).send('User not found or could not be linked to Stripe customer.');
      }

      const productCode = uuidv4().toUpperCase().replace(/-/g, '').substring(0, 12);
      const stripeSubscriptionId = session.subscription || (event.data.object.lines?.data[0]?.subscription) || null;

      await pool.query(
          'INSERT INTO subscription_codes (user_id, code, stripe_subscription_id) VALUES ($1, $2, $3)',
          [userId, productCode, stripeSubscriptionId]
      );
      console.log(`Stored product code ${productCode} for user ID ${userId}`);

      const msg = {
          to: recipientEmail,
          from: {
              email: process.env.SENDGRID_FROM_EMAIL,
              name: process.env.APP_NAME || 'Your App'
          },
          subject: `Your ${process.env.APP_NAME || 'App'} Subscription Activation Code`,
          html: `<h1>Thank you for subscribing...<strong>${productCode}</strong>...</p>`,
      };
      await sgMail.send(msg);
      console.log(`Activation email sent to ${recipientEmail} via SendGrid.`);

  } catch (error) {
      console.error('Error in webhook user processing or email sending:', error.response?.body || error.message);
      if (error.response && error.response.body && error.response.body.errors) {
          console.error('SendGrid specific errors:', error.response.body.errors);
      }
      return res.status(500).send('Internal server error during webhook processing.');
  }
  res.status(200).send('Webhook processed successfully.');
}

// --- API Endpoint to Claim a Product Code (Protected by Auth Middleware) ---
app.post('/api/claim-code', authenticateToken, async (req, res) => {
  // userId is now available from req.user (set by authenticateToken middleware)
  const userId = req.user.id; // Assuming your JWT payload has an 'id' field for the user ID
  const { code } = req.body;

  if (!code) {
      return res.status(400).json({ success: false, message: 'Product code is required.' });
  }
  if (!userId) { // Should be caught by authenticateToken, but good to double-check
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }

  const client = await pool.connect();
  try {
      await client.query('BEGIN');

      // Check if the code belongs to the authenticated user
      const codeResult = await client.query(
          'SELECT id, user_id, is_claimed FROM subscription_codes WHERE code = $1 AND user_id = $2',
          [code.trim().toUpperCase(), parseInt(userId)]
      );

      if (codeResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Invalid product code or code not assigned to this user.' });
      }

      const codeData = codeResult.rows[0];

      if (codeData.is_claimed) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'This code has already been claimed.' });
      }

      // Mark the code as claimed
      await client.query(
          'UPDATE subscription_codes SET is_claimed = TRUE, claimed_at = NOW() WHERE id = $1',
          [codeData.id]
      );

      // Update the user's status to premium
      const updateUserResult = await client.query(
          'UPDATE users SET is_premium = TRUE WHERE id = $1',
          [parseInt(userId)]
      );

      if (updateUserResult.rowCount === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'User account not found to update premium status.' });
      }

      await client.query('COMMIT');
      res.json({ success: true, message: 'Code claimed successfully! Premium features unlocked.' });

  } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error claiming code:', error);
      res.status(500).json({ success: false, message: 'Internal server error. Please try again.' });
  } finally {
      client.release();
  }
});


// --- API Endpoint to check current user's premium status (Protected by Auth Middleware) ---
// Changed from /api/user-status/:userId to /api/me/status or /api/user/status
app.get('/api/me/status', authenticateToken, async (req, res) => {
  const userId = req.user.id; // Get userId from the authenticated token payload

  if (!userId) { // Should be caught by middleware
      return res.status(401).json({ success: false, message: 'User not authenticated.' });
  }

  try {
      const result = await pool.query('SELECT email, is_premium, stripe_customer_id FROM users WHERE id = $1', [parseInt(userId)]);
      if (result.rows.length > 0) {
          res.json({
              success: true,
              userId: parseInt(userId),
              email: result.rows[0].email,
              is_premium: result.rows[0].is_premium,
              stripe_customer_id: result.rows[0].stripe_customer_id
          });
      } else {
          // This case means the token has a userId that doesn't exist in DB, which is an issue.
          res.status(404).json({ success: false, is_premium: false, message: 'User from token not found in database.' });
      }
  } catch (error) {
      console.error('Error fetching user status:', error);
      res.status(500).json({ success: false, is_premium: false, message: 'Internal server error' });
  }
});

const schoolData = {
  "CCUSD": ["Culver City Middle School (CCMS)", "Culver City High School (CCHS)", "El Marino Language School", "El Rincon Elementary School", "Farragut Elementary School", "La Ballona Elementary School", "Linwood E. Howe Elementary School"],
  "LAUSD": ["Abraham Lincoln Senior High", "Academia Moderna", "Academy for Enriched Sciences", "Academy of Environmental & Social Policy (ESP)", "Academy of Medical Arts at Carson High", "Academy of the Canyons", "Academy of the Canyons Middle College High", "Academy of the Redwoods"]
};

app.get('/get-schools', (req, res) => {
    res.json(schoolData);
});

app.post('/save-school', async (req, res) => {
  try {
      const { token, schoolDistrict, schoolName } = req.body;
      if (!token) return res.status(400).json({ success: false, message: "Missing token." });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      await db('user_schools')
          .insert({ user_id: userId, school_district: schoolDistrict, school_name: schoolName })
          .onConflict('user_id')
          .merge();

      res.json({ success: true, message: "School saved successfully." });
  } catch (error) {
      console.error("Error saving school:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/get-user-school', async (req, res) => {
  try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ success: false, message: "Missing token." });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      const school = await db('user_schools').where({ user_id: userId }).first();
      if (!school) return res.json({ success: false, school: null });

      res.json({ success: true, school });
  } catch (error) {
      console.error("Error fetching school:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

const emailVerificationCodes = new Map(); // Store email verification codes temporarily

app.post("/request-email-change", async (req, res) => {
  const { token, password, newEmail } = req.body;
  if (!token || !password || !newEmail) {
    return res.status(400).json({ success: false, message: "Missing fields." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db("users").where({ id: decoded.id }).first();

    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: "Incorrect password." });
    }

    const verificationCode = crypto.randomInt(100000, 999999).toString();
    emailVerificationCodes.set(newEmail, { code: verificationCode, userId: user.id });

    const msg = {
      to: newEmail,
      from: {email:'admin@a1dos-creations.com',name:'A1dos Account'},
      subject: `Change Email for ${user.name}`,
      html: `
      <div style="justify-items:center;">
          <tr height="32" style="height:32px">
          <td></td>
          </tr>
          <tr align="center">
            <div>
              <div>
              </div>
            </div>
            <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
            <tbody>
            <tr>
            <td width="8" style="width:8px"></td>
            <td>
              <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                <div style="font-size:24px"><strong>Email Change Verification Request</strong></div>
                <div style="font-size:24px">For user: <strong>${user.name}</strong></div>
                <div style="font-size:24px">Your verification code is: <strong>${verificationCode}</strong></div>
                <table align="center" style="margin-top:8px">
                <tbody><tr style="line-height:normal">
                <td align="right" style="padding-right:8px">
                </td>
                </tr>
                </tbody>
                </table>
              </div>
            <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, ignore this email. We will never ask for your password or verification code.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/dashboard" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Check activity</a>
            </div>
            </div>
          </tr>
          <tr height="32" style="height:32px">
            <td></td>
          </tr>
          </div>
          `,
          trackingSettings: {
            clickTracking: { enable: false, enableText: false }
          }
  };
  sgMail.send(msg)
      .then(() => res.json({ success: true, message: "Verification code sent." }))
      .catch(error => {
          console.error("SendGrid Error:", error.response.body);
          res.status(500).json({ success: false, message: "Error sending email." });
      });

    res.json({ success: true, message: "Verification code sent to new email." });

  } catch (err) {
    console.error("Error requesting email change:", err);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});
app.post("/verify-email-change", async (req, res) => {
  const { newEmail, code } = req.body;

  if (!newEmail || !code) {
    return res.status(400).json({ success: false, message: "Missing fields." });
  }

  const storedData = emailVerificationCodes.get(newEmail);
  if (!storedData || storedData.code !== code) {
    return res.status(400).json({ success: false, message: "Invalid or expired code." });
  }

  try {
    await db("users").where({ id: storedData.userId }).update({ email: newEmail });
    emailVerificationCodes.delete(newEmail);

    res.json({ success: true, message: "Email updated successfully." });

  } catch (err) {
    console.error("Error updating email:", err);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});


app.post('/send-verification-code', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await db('users').where({ email }).first();
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiryTime = new Date(Date.now() + 15 * 60 * 1000); 

        await db('verification_codes').insert({
            user_id: user.id,
            code: verificationCode,
            expiry: expiryTime
        });

        const msg = {
            to: email,
            from: {email:'admin@a1dos-creations.com',name:'A1dos Account'},
            subject: `Password Change Request`,
            html: `
            <div style="justify-items:center;">
                <tr height="32" style="height:32px">
                <td></td>
                </tr>
                <tr align="center">
                  <div>
                    <div>
                    </div>
                  </div>
                  <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                  <tbody>
                  <tr>
                  <td width="8" style="width:8px"></td>
                  <td>
                    <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                      <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                      <div style="font-size:24px"><strong>Password Change Verification Request</strong></div>
                      <div style="font-size:24px">For user: <strong>${user.name}</strong></div>
                      <div style="font-size:24px">Your verification code is: <strong>${verificationCode}</strong></div>
                      <table align="center" style="margin-top:8px">
                      <tbody><tr style="line-height:normal">
                      <td align="right" style="padding-right:8px">
                      </td>
                      </tr>
                      </tbody>
                      </table>
                    </div>
                  <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, ignore this email. We will never ask for your password or verification code.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/dashboard" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Check activity</a>
                  </div>
                  </div>
                </tr>
                <tr height="32" style="height:32px">
                  <td></td>
                </tr>
                </div>
                `,
                trackingSettings: {
                  clickTracking: { enable: false, enableText: false }
                }
        };
        sgMail.send(msg)
            .then(() => res.json({ success: true, message: "Verification code sent." }))
            .catch(error => {
                console.error("SendGrid Error:", error.response.body);
                res.status(500).json({ success: false, message: "Error sending email." });
            });

    } catch (error) {
        console.error("Error sending verification code:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});

app.post('/update-password', async (req, res) => {
  try {
    const { email, verificationCode, newPassword } = req.body;

    const user = await db('users').where({ email }).first();
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
    }

    const validCode = await db('verification_codes')
        .where({ user_id: user.id, code: verificationCode })
        .andWhere('expiry', '>', new Date())
        .first();

    if (!validCode) {
        return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db('users').where({ id: user.id }).update({ password: hashedPassword });

    await db('verification_codes').where({ user_id: user.id }).del();

    const newToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    res.json({ success: true, message: "Password updated successfully.", token: newToken });

      const msg = {
        to: email,
        from: {email:'admin@a1dos-creations.com',name:'A1dos Account'},
        subject: `${user.name} Password Changed`,
        html: `
                <tr height="32" style="height:32px"><td></td></tr>
                <tr align="center">
                <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                <tbody>
                <tr>
                <td width="8" style="width:8px"></td>
                <td>
                <br>
                <br>
                <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                <div style="font-size:24px"><strong>A1dos Account Password Changed</strong></div>
                <div style="font-size:19px">For account: <strong>${user.name} (${email})</strong></div>
                <div style="font-size:15px">Your A1 account password has been changed.</div>
                <table align="center" style="margin-top:8px">
                <tbody><tr style="line-height:normal">
                <td align="right" style="padding-right:8px">
                </td>
                </tr>
                </tbody>
                </table>
                </div>
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, reset your password immediately. Please review your account activity.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/dashboard" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Check activity</a>
                </div>
                </div>
                </tr>
                <tr height="32" style="height:32px"><td></td></tr>
        `,
        trackingSettings: {
          clickTracking: { enable: false, enableText: false }
        }
    };
    sgMail.send(msg)
    .then(() => res.json({ success: true, message: "Verification code sent." }))
    .catch(error => {
        console.error("SendGrid Error:", error);

        if (error.response) {
            console.error("SendGrid Response Error:", error.response.body);
        } else {
            console.error("Unknown SendGrid error. No response body.");
        }

        res.status(500).json({ success: false, message: "Error sending email." });
    });
  } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// --- User Authentication Endpoints ---
app.post('/register-user', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json('Please fill in name, email, and password');
  }
  try {
    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    const [newUser] = await db('users')
      .insert({
        name: name.trim(),
        email: email.trim(),
        password: hashedPassword,
        email_notifications: true
      })
      .returning(['id', 'name', 'email', 'email_notifications', 'created_at']);
    
    const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '2d' });
    
    const msg = {
      to: email,
      from: {email:'admin@a1dos-creations.com',name:'A1dos Account'},
      subject: `🚀 Welcome to A1dos Creations, ${newUser.name}! ✨`,
      html: `
                <tr height="32" style="height:32px"><td></td></tr>
                  <tr align="center"> {/* This aligns the table cell content */}
                  <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px"> {/* This table is centered by the parent tr align="center" */}
                  <tbody>
                  <tr>
                  <td width="8" style="width:8px"></td>
                  <td> {/* This td contains your main content */}
                  <br>
                  <br>
                  <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px; margin: 0 auto;" align="center"> {/* Add margin: 0 auto; here */}
                  <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word"> {/* This div has text-align: center; */}
                  <div style="font-size:24px"><strong>Welcome To A1dos Creations!</strong></div> {/* This text will be centered by its parent */}
                  <div style="font-size:19px">Welcome, <strong>${name}!</strong></div> {/* This text will be centered by its parent */}
                  <div style="font-size:15px">${email}</div> {/* This text will be centered by its parent */}
                  <table align="center" style="margin-top:8px"> {/* This table is centered by align="center" */}
                  <tbody><tr style="line-height:normal">
                  <td align="right" style="padding-right:8px">
                  </td>
                  </tr>
                  </tbody>
                  </table>
                  </div>
                  <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left">
                  <br>Welcome! Check out your account dashboard to review recent activity and upgrade your account!
                  <div style="padding-top:32px;text-align:center"> {/* This div has text-align: center; */}
                  <a href="https://a1dos-creations.com/account/dashboard" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Account Dashboard</a> {/* This inline-block element will be centered by its parent */}
                  <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"> 
                  <br>We're happy to have you!</div>
                  </div>
                  </div>
                  </tr>
                <tr height="32" style="height:32px"><td></td></tr>
      `
    };

    sgMail.send(msg)
      .then(() => console.log(`Welcome email sent to ${email}`))
      .catch(error => console.error("SendGrid Error:", error.response ? error.response.body : error));
    
    res.json({ 
      user: { 
        name: newUser.name, 
        email: newUser.email, 
        email_notifications: newUser.email_notifications, 
        created_at: newUser.created_at 
      }, 
      token 
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === '23505') {
      return res.status(400).json('A user with that email already exists.');
    }
    return res.status(500).json('Error registering user');
  }
});

app.post('/login-user', async (req, res) => {
  const { email, password, returnUrl, sourceAppId } = req.body; // Expect these in the POST body

  if (!email || !password) {
    return res.status(400).json('Please provide email and password');
  }

  try {
    const user = await db('users')
      .select('id', 'name', 'email', 'password', 'email_notifications') // Added email_notifications
      .where({ email: email.trim() })
      .first();

    if (!user) {
      console.log(`Login attempt failed: User not found for email ${email}`);
      return res.status(400).json('Email or password is incorrect');
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      console.log(`Login attempt failed: Incorrect password for user ${user.id}`);
      return res.status(400).json('Email or password is incorrect');
    }

    const performRedirect = sourceAppId && returnUrl && ALLOWED_RETURN_URLS.includes(returnUrl);

    if (performRedirect) {
      console.log(`Cross-site login initiated from source '${sourceAppId}' for user ${user.id}. Valid returnUrl: ${returnUrl}`);

      const tempAuthTokenPayload = {
        id: user.id,
        email: user.email,
        name: user.name // Include necessary info Site A might need immediately
      };
      const tempAuthToken = jwt.sign(tempAuthTokenPayload, JWT_SECRET, { expiresIn: '120s' }); // e.g., 2 minutes validity

      const redirectTarget = new URL(returnUrl); // Use URL constructor for safety
      redirectTarget.searchParams.append('authToken', tempAuthToken);

      console.log(`Redirecting user ${user.id} to ${redirectTarget.toString()}`);
      return res.redirect(redirectTarget.toString());

    } else {
      console.log(`Standard login successful for user ${user.id}`);

      const standardToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '2d' }); // Your original expiry

      let deviceInfo = req.headers['user-agent'] || "Unknown device";
      if (req.headers['x-client-source'] && req.headers['x-client-source'] === 'extension') {
        deviceInfo = "STL Extension";
      }
      const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || "Unknown IP";
      let location = "Unknown Location";
      try {
        const locationResponse = await fetch(`http://ip-api.com/json/${ipAddress}`);
        const locationData = await locationResponse.json();
        if (locationData.status === "success") {
          location = `${locationData.city}, ${locationData.regionName}, ${locationData.country}`;
        }
      } catch (error) {
        console.error("Error fetching location:", error);
      }

      await db('user_sessions').insert({
        user_id: user.id,
        session_token: standardToken, // Use the standard token here
        device_info: deviceInfo,
        ip_address: ipAddress,
        location: location,
        login_time: new Date(),
        last_activity: new Date()
      });

      res.json({
        user: { name: user.name, email: user.email, email_notifications: user.email_notifications },
        token: standardToken // Return the standard token
      });

      if(user.email_notifications){
        const msg = {
          to: email,
          from: {email:'admin@a1dos-creations.com',name:'A1dos Account'},
          subject: `⚠️ New login for user: ${user.name}`,
          html: `
                    <tr height="32" style="height:32px"><td></td></tr>
                    <tr align="center">
                    <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                    <tbody>
                    <tr>
                    <td width="8" style="width:8px"></td>
                    <td>
                    <br>
                    <br>
                    <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                    <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                    <div style="font-size:24px"><strong>New login for ${user.name}</strong></div>
                    <div style="font-size:19px"></strong></div>
                    <div style="font-size:15px">${user.email}</div>
                    <div style="font-size:15px">Sign in location: ${ipAddress}</div>
                    <table align="center" style="margin-top:8px">
                    <tbody><tr style="line-height:normal">
                    <td align="right" style="padding-right:8px">
                    </td>
                    </tr>
                    </tbody>
                    </table>
                    </div>
                    <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, please reset your password.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/dashboard?resetPsw=true" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Reset Password</a>
                    <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>Be sure to check your account's linked devices.</div>
                    </div>
                    </div>
                    </tr>
                    <tr height="32" style="height:32px"><td></td></tr>
          `,
          trackingSettings: {
            clickTracking: { enable: false, enableText: false },
        }
        }
        sgMail
          .send(msg)
          .catch(error => console.error("SendGrid Error:", error.response.body));
        }
    }

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json('Error logging in');
  }
});

// --- Google OAuth Setup ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,     
  process.env.GOOGLE_CLIENT_SECRET, 
  'https://a1dos-login.onrender.com/auth/google/callback'
);

app.get('/auth/google', (req, res) => {
  const state = req.query.state || '';

  const scopes = [
    'openid',
    'https://www.googleapis.com/auth/classroom.courses.readonly', 
    'https://www.googleapis.com/auth/calendar'                    
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: state
  });
  res.redirect(url);
});

app.get('/health', (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state; 

  if (!code) {
    return res.status(400).send("No code provided.");
  }
  
  if (!userId) {
    console.error("UserId not provided in state parameter. Cannot link Google account.");
    return res.redirect('https://a1dos-creations.com/account/account?googleLinked=false');
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("Received tokens from Google:", tokens);

    console.log("User ID from state:", userId);
    console.log("Google Tokens:", tokens);

    let googleId = null;
    if (tokens.id_token) {
      try {
        googleId = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()).sub;
        console.log("Extracted Google ID:", googleId);
      } catch (decodeErr) {
        console.error("Error decoding id_token:", decodeErr);
      }
    } else {
      console.warn("No id_token received from Google");
    }
    
    await db('users')
      .where({ id: userId })
      .update({ 
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date,
        google_id: googleId
      });
      res.redirect('https://a1dos-creations.com/account/account?googleLinked=true');

      if(user.email_notifications){
        const msg = {
          to: email,
          from: {email:'admin@a1dos-creations.com',name:'A1dos Account'},
          subject: `❗A Google Account Was Linked To Your A1dos Account.`,
          html: `
                      <tr height="32" style="height:32px"><td></td></tr>
                      <tr align="center">
                      <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                      <tbody>
                      <tr>
                      <td width="8" style="width:8px"></td>
                      <td>
                      <br>
                      <br>
                      <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                      <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                      <div style="font-size:24px"><strong>Google Account Linked</strong></div>
                      <div style="font-size:19px">To account: <strong>${user.name} (${email})</strong></div>
                      <table align="center" style="margin-top:8px">
                      <tbody><tr style="line-height:normal">
                      <td align="right" style="padding-right:8px">
                      </td>
                      </tr>
                      </tbody>
                      </table>
                      </div>
                      <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, reset your password immediately and disconnect all Google accounts. Please review your account activity.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/dashboard" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Review Activity</a>
                      </div>
                      </div>
                      </tr>
                      <tr height="32" style="height:32px"><td></td></tr>
          `,
          trackingSettings: {
            clickTracking: { enable: false, enableText: false },
        }
        }
        sgMail
          .send(msg)
          .then(() => console.log(`Login email sent to ${email}`))
          .catch(error => console.error("SendGrid Error:", error.response.body));
        }
      } catch (err) {
    console.error("Error exchanging code for token:", err);
    res.status(500).send("Authentication error");
  }
});

app.post('/verify-token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ valid: false, error: "No token provided" });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const session = await db('user_sessions').where({ session_token: token }).first();
    if (!session) {
      return res.status(401).json({ valid: false, error: "Session revoked" });
    }
    res.json({ valid: true, user: decoded });
  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(401).json({ valid: false, error: "Invalid token" });
  }
});

app.post('/unlink-google', async (req, res) => {
  try {
      const { token } = req.body;
      if (!token) {
          return res.status(400).json({ success: false, message: "Missing token." });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      const user = await db('users').where({ id: userId }).first();
      if (!user) {
          return res.status(404).json({ success: false, message: "User not found." });
      }

      await db('users')
          .where({ id: userId })
          .update({
              google_access_token: null,
              google_refresh_token: null,
              google_token_expiry: null
          });

      res.json({ success: true, message: "Google account unlinked successfully." });
  } catch (error) {
      console.error("Error unlinking Google:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/update-notifications', async (req, res) => {
  try {
      const { token, emailNotifications } = req.body;
      if (!token) {
          return res.status(400).json({ success: false, message: "Missing token." });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;
      
      const user = await db('users').where({ id: userId }).first();
      if (!user) {
          return res.status(404).json({ success: false, message: "User not found." });
      }
      
      await db('users')
        .where({ id: userId })
        .update({ email_notifications: emailNotifications });
      
      // Retrieve the user's email from the database record
      const email = user.email;

      const msg = {
        to: email,
        from: {email:'admin@a1dos-creations.com',name:'A1dos Account'},
        subject: `✅ Notifications Restored`,
        html: `
          <tr height="32" style="height:32px"><td></td></tr>
          <tr align="center">
          <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
          <tbody>
          <tr>
          <td width="8" style="width:8px"></td>
          <td>
          <br>
          <br>
          <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
          <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
          <div style="font-size:24px"><strong>Notifications Restored</strong></div>
          <div style="font-size:19px">For account: <strong>${user.name} (${email})</strong></div>
          <table align="center" style="margin-top:8px">
          <tbody><tr style="line-height:normal">
          <td align="right" style="padding-right:8px"></td>
          </tr></tbody>
          </table>
          </div>
          <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left">
            <br>You will now receive updates on Google Accounts linking, STL changes (regarding your account), and password changes.
            <div style="padding-top:32px;text-align:center">
              <a href="https://a1dos-creations.com/account/dashboard" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:blue;border-radius:5px;min-width:90px" target="_blank">
                Account Dashboard
              </a>
            </div>
          </div>
          </tr>
          <tr height="32" style="height:32px"><td></td></tr>
        `,
        trackingSettings: {
          clickTracking: { enable: false, enableText: false },
        }
      };
      
      sgMail
        .send(msg)
        .then(() => console.log(`Notification email sent to ${email}`))
        .catch(error => console.error("SendGrid Error:", error.response.body));
      
      res.json({ success: true, message: "Notification preferences updated." });
  } catch (error) {
      console.error("Error updating notifications:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// --- Stripe Integration Endpoint with user metadata ---
app.post('/create-checkout-session', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.id;
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Premium (STL+ Product Key)'
          },
          unit_amount: 200, // amount in cents
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: 'https://a1dos-creations.com/account/chk/success',
      cancel_url: 'https://a1dos-creations.com/account/chk/cancel',
      metadata: {
        user_id: user_id
      }
    });
    
    console.log("Stripe Checkout session created:", session.id);
    return res.json({ id: session.id });
  } catch (error) {
    console.error("Error creating Stripe Checkout session:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; 

// Helper function to generate a secure 20-char upgrade key
function generateSecureCode(length = 20) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  // Note: In a real webhook, you may not pass your token in the body.
  const { token } = req.body; 
  let event;
  
  // Validate token to identify the user initiating this process
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded.id;
  
  const user = await db('users').where({ id: userId }).first();
  if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
  }
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.user_id;
    
    console.log(`Payment succeeded for user ${userId}. Session ID: ${session.id}`);
    
    try {
      await db.transaction(async trx => {
        await trx('users').where({ id: userId }).update({ premium: true });
        
        const upgradeCode = generateSecureCode();
        await trx('upgrade_keys')
          .insert({ code: upgradeCode, status: 'UNCLAIMED', user_id: userId });
        
        const msg = {
          to: user.email,
          from: {email:'admin@a1dos-creations.com',name:'A1dos Account'},
          subject: `Welcome to Premium ${user.name}! 🎉`,
          html: `
           <tr height="32" style="height:32px"><td></td></tr>
                <tr align="center">
                <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                <tbody>
                <tr>
                <td width="8" style="width:8px"></td>
                <td>
                <br>
                <br>
                <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                <div style="font-size:24px"><strong>🎁 Welcome To Premium!</strong></div>
                <div style="font-size:19px">For account: <strong>${user.name}</strong> <strong style="font-size:16px">(${email})</strong></div>
                <div style="font-size:15px">Enter this key to unlock STL+</div>
                <div style="font-size:17px"><strong>${upgradeCode}</strong></div>
                <table align="center" style="margin-top:8px">
                <tbody><tr style="line-height:normal">
                <td align="right" style="padding-right:8px">
                </td>
                </tr>
                </tbody>
                </table>
                </div>
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>Don't share this prouduct key, you will not need another one. We will never ask for this key, do not share it.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/dashboard" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Account Dashboard</a>
                </div>
                </div>
                </tr>
                <tr height="32" style="height:32px"><td></td></tr>
          `,
          trackingSettings: {
            clickTracking: { enable: false, enableText: false }
          }
        };
        await sgMail.send(msg);
        console.log(`User ${userId} updated to premium and upgrade key emailed.`);
      });
    } catch (err) {
      console.error('Error during premium update and upgrade key generation:', err);
    }
  }
  
  res.json({ received: true });
});


app.post('/get-user-sessions', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "Missing token." });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const sessionsQuery = `
      SELECT DISTINCT ON (device_info, location) 
          id, device_info, location, login_time, last_activity, session_token
      FROM user_sessions
      WHERE user_id = ?
      ORDER BY device_info, location, login_time DESC;
    `;
    const result = await db.raw(sessionsQuery, [userId]);
    res.json({ success: true, sessions: result.rows });
  } catch (error) {
    console.error("Error retrieving user sessions:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/revoke-session', async (req, res) => {
  try {
    const { token, sessionId } = req.body;
    if (!token || !sessionId) {
      return res.status(400).json({ success: false, message: "Missing token or sessionId." });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const session = await db('user_sessions')
      .where({ id: sessionId, user_id: userId })
      .first();
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }
    await db('user_sessions').where({ id: sessionId }).del();
    console.log(`Session ${sessionId} revoked successfully.`);

    if (activeSockets.has(session.session_token)) {
      const ws = activeSockets.get(session.session_token);
      ws.send(JSON.stringify({ action: "logout" }));
      activeSockets.delete(session.session_token);
    }

    res.json({ success: true, message: "Session revoked successfully." });
  } catch (error) {
    console.error("Error revoking session:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// ----- Check Google Link Status Endpoint -----
app.post('/check-google-link', async (req, res) => {
  try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ linked: false, message: "No token provided." });
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.id;
      const user = await db('users').where({ id: userId }).select('google_id').first();
      if (user && user.google_id) {
          return res.json({ linked: true });
      } else {
          return res.json({ linked: false });
      }
  } catch (error) {
      console.error("Error checking Google link:", error);
      return res.status(500).json({ linked: false, message: "Internal server error." });
  }
});


////////////////////////////////////////////
// NEW: Google Calendar Sync Endpoints
////////////////////////////////////////////

async function getCalendarClient(user) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://a1dos-login.onrender.com/auth/google/callback'
  );
  oauth2Client.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token
  });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

app.post('/create-calendar', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Missing token." });
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const user = await db('users').where({ id: userId }).first();
    if (!user || !user.google_access_token) {
      return res.status(400).json({ success: false, message: "Google account not linked." });
    }
    const calendarClient = await getCalendarClient(user);
    const calendarList = await calendarClient.calendarList.list();
    const calendars = calendarList.data.items;
    let syncedCalendar = calendars.find(cal => cal.summary === "🔄️ STL Synced Tasks");
    if (!syncedCalendar) {
      const createdCal = await calendarClient.calendars.insert({
        requestBody: {
          summary: "🔄️ STL Synced Tasks",
          timeZone: "America/Los_Angeles" 
        }
      });
      syncedCalendar = createdCal.data;
    }
    res.json({ success: true, calendarId: syncedCalendar.id });
  } catch (error) {
    console.error("Error in /create-calendar:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/add-task-event', async (req, res) => {
  try {
    const { token, taskTitle, taskDueDate, taskDescription } = req.body;
    if (!token || !taskTitle || !taskDueDate) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const user = await db('users').where({ id: userId }).first();
    if (!user || !user.google_access_token) {
      return res.status(400).json({ success: false, message: "Google account not linked." });
    }
    const calendarClient = await getCalendarClient(user);
    const calRes = await fetch('https://a1dos-login.onrender.com/create-calendar', {  
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const calData = await calRes.json();
    if (!calData.success) {
      return res.status(400).json({ success: false, message: "Could not create/retrieve calendar." });
    }
    const calendarId = calData.calendarId;
    
    const eventRes = await calendarClient.events.insert({
      calendarId,
      requestBody: {
        summary: taskTitle,
        description: taskDescription || "",
        start: {
          dateTime: new Date(taskDueDate).toISOString(),
          timeZone: "America/Los_Angeles"
        },
        end: {
          dateTime: new Date(new Date(taskDueDate).getTime() + 60 * 60 * 1000).toISOString(), // 1-hour event
          timeZone: "America/Los_Angeles"
        }
      }
    });
    const event = eventRes.data;
    res.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error("Error in /add-task-event:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/delete-task-event', async (req, res) => {
  try {
    const { token, eventId } = req.body;
    if (!token || !eventId) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const user = await db('users').where({ id: userId }).first();
    if (!user || !user.google_access_token) {
      return res.status(400).json({ success: false, message: "Google account not linked." });
    }
    const calendarClient = await getCalendarClient(user);
    
    const calendarList = await calendarClient.calendarList.list();
    const calendars = calendarList.data.items;
    const syncedCalendar = calendars.find(cal => cal.summary === "🔄️ STL Synced Tasks");
    if (!syncedCalendar) {
      return res.status(400).json({ success: false, message: "Synced calendar not found." });
    }
    
    await calendarClient.events.delete({
      calendarId: syncedCalendar.id,
      eventId: eventId
    });
    
    res.json({ success: true, message: "Event deleted successfully." });
  } catch (error) {
    console.error("Error in /delete-task-event:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/claim-upgrade-code', async (req, res) => {
  const { token, code } = req.body;
  if (!token || !code) {
    return res.status(400).json({ success: false, message: "Missing token or code." });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    await db.transaction(async trx => {
      const upgradeKey = await trx('upgrade_keys')
        .select('*')
        .where({ code, status: 'UNCLAIMED' })
        .forUpdate()
        .first();
      if (!upgradeKey) {
        throw new Error('Invalid or already claimed code.');
      }
      await trx('upgrade_keys')
        .update({ status: 'CLAIMED', user_id: userId, claimed_at: trx.fn.now() })
        .where({ code });
      await trx('users')
        .update({ premium: true })
        .where({ id: userId });
    });
    res.json({ success: true, message: "Upgrade code claimed successfully." });
  } catch (error) {
    console.error("Error claiming upgrade code:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

const AI_API_KEY = process.env.AI_API_KEY;
const AI_API_ENDPOINT = process.env.AI_API_ENDPOINT;

if (!AI_API_KEY || !AI_API_ENDPOINT) {
    console.error("Error: AI_API_KEY or AI_API_ENDPOINT not found in .env file.");
    process.exit(1); // Stop the server if keys are missing
}

const userUsage = new Map();

function updateRemainingCount(count) {
  if (count === Infinity || count === 'Infinity') { // Check for number or string representation
      messagesRemaining = Infinity;
      remainingCountSpan.textContent = 'Unlimited'; // Display something user-friendly
      console.log("Admin user detected - Unlimited messages set.");
  } else {
      const numericCount = parseInt(count, 10);
      messagesRemaining = Math.max(0, isNaN(numericCount) ? 0 : numericCount);
      remainingCountSpan.textContent = messagesRemaining;
  }

   const limitReached = (typeof messagesRemaining === 'number' && messagesRemaining <= 0);

   chatInput.disabled = limitReached;
   sendButton.disabled = limitReached;
   chatInput.placeholder = limitReached ? "Daily limit reached." : "Type your question...";

   if (!limitReached) {
      if (loadingIndicator.style.display === 'none') {
          chatInput.disabled = false;
          sendButton.disabled = false;
      }
   }
}

function checkAndIncrementUsage(userId, isAdmin = false) {
  // If user is admin, always allow and don't track/increment
  if (isAdmin) {
      console.log(`Admin user ${userId} bypassing usage limit.`);
      return { allowed: true, remaining: Infinity };
  }

  // Existing logic for non-admin users
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const userData = userUsage.get(userId); // Still track non-admins by their unique ID

  if (userData) {
      if (now - userData.timestamp > oneDay) {
          console.log(`Resetting count for non-admin user ${userId}`);
          userData.count = 0;
          userData.timestamp = now;
      }

      const currentLimit = 10; // Or your current limit
      if (userData.count >= currentLimit) {
          console.log(`Non-admin user ${userId} reached daily limit.`);
          return { allowed: false, remaining: 0 };
      }

      userData.count++;
      userUsage.set(userId, userData);
      console.log(`Non-admin user ${userId} used message <span class="math-inline">\{userData\.count\}/</span>{currentLimit}`);
      return { allowed: true, remaining: currentLimit - userData.count };
  } else {
      const currentLimit = 10; // Or your current limit
      userUsage.set(userId, { count: 1, timestamp: now });
      console.log(`Non-admin user <span class="math-inline">\{userId\} used message 1/</span>{currentLimit}`);
      return { allowed: true, remaining: currentLimit - 1 };
  }
}

// --- Add Authentication Middleware (Example - reuse/adapt isAdmin or create isAuth) ---
const isAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);

  try {
      const decoded = jwt.verify(token, JWT_SECRET);
      // Check if user exists in DB (optional but good)
      const user = await db('users').where({ id: decoded.id }).first();
      if (!user) throw new Error('User not found');
      req.userId = decoded.id; // Attach validated userId
      next();
  } catch (err) {
      console.error("Auth error:", err.message);
      return res.sendStatus(403); // Forbidden
  }
};

// --- NEW: Conversation Endpoints ---

// 1. Start a New Conversation
app.post('/api/conversations', isAuth, async (req, res) => {
  const userId = req.userId; // Get userId from isAuth middleware
  try {
      const [newConversation] = await db('conversations')
          .insert({ user_id: userId, title: req.body.title || 'New Chat' }) // Optionally take title from request
          .returning(['id', 'title', 'created_at', 'updated_at']);

      // Optionally: Add initial model greeting message to DB here
      await db('conversation_messages').insert({
           conversation_id: newConversation.id,
           role: 'model',
           content: 'How can I help you learn today?', // Consistent initial message
           order: 0 // First message
      });

      res.status(201).json(newConversation);
  } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to start conversation" });
  }
});

// 2. List User's Conversations
app.get('/api/conversations', isAuth, async (req, res) => {
  const userId = req.userId;
  try {
      const conversations = await db('conversations')
          .where({ user_id: userId })
          .select('id', 'title', 'updated_at')
          .orderBy('updated_at', 'desc');
      res.json(conversations);
  } catch (error) {
      console.error("Error listing conversations:", error);
      res.status(500).json({ error: "Failed to list conversations" });
  }
});

// 3. Get History for a Specific Conversation
app.get('/api/conversations/:conversationId', isAuth, async (req, res) => {
  const userId = req.userId;
  const { conversationId } = req.params;
  try {
      // Verify user owns this conversation
      const conversation = await db('conversations')
          .where({ id: conversationId, user_id: userId })
          .first();

      if (!conversation) {
          return res.status(404).json({ error: 'Conversation not found or access denied.' });
      }

      const messages = await db('conversation_messages')
          .where({ conversation_id: conversationId })
          .orderBy('order', 'asc')
          .select('role', 'content');

      // Format for Gemini API (and potentially frontend)
      const history = messages.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.content }]
      }));

      res.json({ history }); // Send back the formatted history

  } catch (error) {
      console.error(`Error fetching history for conversation ${conversationId}:`, error);
      res.status(500).json({ error: "Failed to fetch conversation history" });
  }
});

// 4. Delete a Conversation
app.delete('/api/conversations/:conversationId', isAuth, async (req, res) => {
  const userId = req.userId;
  const { conversationId } = req.params;
  try {
      const deletedCount = await db('conversations')
          .where({ id: conversationId, user_id: userId })
          .del();

      if (deletedCount > 0) {
          // Also delete associated messages (or use cascading delete in DB)
          await db('conversation_messages')
              .where({ conversation_id: conversationId })
              .del();
          res.status(200).json({ success: true, message: 'Conversation deleted.' });
      } else {
          res.status(404).json({ success: false, message: 'Conversation not found or access denied.' });
      }
  } catch (error) {
      console.error(`Error deleting conversation ${conversationId}:`, error);
      res.status(500).json({ error: "Failed to delete conversation" });
  }
});


app.post('/api/chat', isAuth, async (req, res) => { // Use isAuth middleware
  const userIdFromDb = req.userId;
  const { conversationId, newMessageText, extensionUserId } = req.body;

  if (!conversationId || !newMessageText || !extensionUserId) {
      return res.status(400).json({ error: 'conversationId, newMessageText, and extensionUserId are required.' });
  }

  let userIsAdmin = false;
  try {
      // Fetch admin status (if needed for rate limit - could be attached in isAuth)
      const user = await db('users').where({ id: userIdFromDb }).select('is_admin').first();
      if (!user) return res.status(404).json({ error: 'User not found.' }); // Should not happen if isAuth passed
      userIsAdmin = user.is_admin === true;

      // Verify user owns the conversation
      const conversation = await db('conversations')
           .where({ id: conversationId, user_id: userIdFromDb })
           .first();
      if (!conversation) {
          return res.status(403).json({ error: 'Access denied to this conversation.' });
      }

  } catch (dbError) {
       console.error("DB error checking user/conversation:", dbError);
       return res.status(500).json({ error: 'Database error checking permissions.' });
  }

  const usage = checkAndIncrementUsage(extensionUserId, userIsAdmin);
  if (!usage.allowed) {
      return res.status(429).json({ error: 'Daily message limit reached.', remaining: usage.remaining });
  }

  // --- Transaction: Fetch History, Save User Msg, Call AI, Save AI Msg ---
  try {
      let historyForApi = [];
      let newAiMessageContent = '';

      await db.transaction(async trx => {
          const messages = await trx('conversation_messages')
              .where({ conversation_id: conversationId })
              .orderBy('order', 'asc')
              .select('role', 'content');

           historyForApi = messages.map(msg => ({
              role: msg.role,
              parts: [{ text: msg.content }]
          }));

          const nextOrder = messages.length;

          const userMessageForDb = {
              conversation_id: conversationId,
              role: 'user',
              content: newMessageText,
              order: nextOrder
          };
          await trx('conversation_messages').insert(userMessageForDb);

           historyForApi.push({ role: "user", parts: [{ text: newMessageText }] });

          const helperPromptPrefix = `You are an AI assistant for students. Your goal is to help students understand concepts, brainstorm ideas, structure writing, or learn processes. You MUST NOT provide direct answers to homework questions, write essays/code for them, solve complex math problems step-by-step if it seems like homework, or do anything that would facilitate cheating. Instead, guide them, ask probing questions, explain underlying concepts, suggest resources, or help them break down the problem. Focus on fostering understanding and critical thinking. You can provide answers if the question does not seem like cheating or homework/schoolwork. Respond only to the user's query below, keeping these constraints in mind:\n\nUser Query: `;
          let finalHistoryForApi = JSON.parse(JSON.stringify(historyForApi)); // Deep copy
          const lastMsgIndex = finalHistoryForApi.length -1;
          if(lastMsgIndex >=0 && finalHistoryForApi[lastMsgIndex].role === 'user'){
              finalHistoryForApi[lastMsgIndex].parts[0].text = helperPromptPrefix + finalHistoryForApi[lastMsgIndex].parts[0].text;
          }

          const fullUrl = `${AI_API_ENDPOINT}?key=${AI_API_KEY}`;
          const aiResponse = await fetch(fullUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: finalHistoryForApi })
          });

          if (!aiResponse.ok) {
               const errorBody = await aiResponse.text();
               console.error(`Gemini API Error (${aiResponse.status}): ${errorBody}`);
               let errMsg = `Gemini API request failed with status ${aiResponse.status}`;
               try { errMsg = JSON.parse(errorBody).error?.message || errMsg; } catch(e){}
               throw new Error(errMsg); // Throw to trigger rollback
          }
          const aiData = await aiResponse.json();
          newAiMessageContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

          if (!newAiMessageContent) {
              console.error("Gemini response format unexpected:", JSON.stringify(aiData));
              throw new Error("Failed to extract message from Gemini response."); // Trigger rollback
          }

          const aiMessageForDb = {
              conversation_id: conversationId,
              role: 'model',
              content: newAiMessageContent,
              order: nextOrder + 1 // Order after user message
          };
          await trx('conversation_messages').insert(aiMessageForDb);

          await trx('conversations')
              .where({ id: conversationId })
              .update({ updated_at: trx.fn.now() });
      }); // Transaction commits here if all steps succeed

      let remainingValueToSend = usage.remaining;
      if (usage.remaining === Infinity) {
        remainingValueToSend = 'Unlimited'; 
      } else {
        remainingValueToSend = usage.remaining;
      }

      res.json({
          reply: newAiMessageContent, // Send only the new reply
          remaining: remainingValueToSend
      });

  } catch (error) {
      console.error("Error processing chat request:", error);
       if (!userIsAdmin) {
           const userData = userUsage.get(extensionUserId);
           if(userData) {
               userData.count = Math.max(0, userData.count - 1);
               userUsage.set(extensionUserId, userData);
           }
       }
      res.status(500).json({
          error: `Failed to process chat: ${error.message}`,
          remaining: usage.remaining // Or recalculate
      });
  }
});


// --- WebSocket Setup ---
app.use(cors()); // Keep CORS for HTTP requests
app.use(express.json());

// === REST API Endpoints ===
app.get('/api/health', (req, res) => {
    res.status(200).send('OK');
});

const FRONTEND_URL = process.env.FRONTEND_URL || "https://a1dos-creations.com";
const BACKEND_HOST = process.env.RENDER_EXTERNAL_URL || `https://api.a1dos-creations.com/`;

app.post('/create', (req, res) => {
  const newId = generateRandomId();
  whiteboards[newId] = { elements: {}, users: {} };
  res.json({ boardId: newId });
});

app.post('/create-custom', (req, res) => {
  const customId = req.body.customId;
  if (!customId || whiteboards[customId]) {
    return res.status(400).json({ error: 'Custom ID is invalid or already taken' });
  }
  whiteboards[customId] = { elements: {}, users: {} };
  res.json({ boardId: customId });
});

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));