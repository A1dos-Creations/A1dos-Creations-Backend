require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const knex = require('knex');
const cors = require('cors');
const { google } = require('googleapis');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const allowedOrigins = [
  'https://a1dos-creations.com',
  'https://a1dos-login.onrender.com',
  'chrome-extension://bilnakhjjjkhhhdlcajijkodkhmanfbg',
  'chrome-extension://pafdkffolelojifgeepmjjofdendeojf'
];

const app = express();
app.use(cors({
  origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
      } else {
          callback(new Error('Not allowed by CORS'));
      }
  },
  methods: 'GET,POST',
  allowedHeaders: 'Content-Type,Authorization'
}));
app.use(express.json());

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});

const JWT_SECRET = process.env.JWT_SECRET;

const crypto = require('crypto');

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
            from: 'admin@a1dos-creations.com',
            subject: `${user.name} Password Change Verification Code`,
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
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, ignore this email. We will never ask for your password or verification code.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/account" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Check activity</a>
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
                console.error("SendGrid Error:", error.response.body);
                res.status(500).json({ success: false, message: "Error sending email." });
            });

    } catch (error) {
        console.error("Error sending verification code:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});

app.post('/update-password', async (req, res) => {
  const { email, verificationCode, newPassword } = req.body;
  try {
      const user = await db('users').where({ email }).first();
      if (!user) {
          return res.status(404).json({ success: false, message: "User not found." });
      }

      const storedCode = await db('verification_codes')
          .where({ user_id: user.id, code: verificationCode })
          .where('expiry', '>', new Date()) 
          .orderBy('created_at', 'desc')
          .first();

      if (!storedCode) {
          return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await db('users').where({ id: user.id }).update({ password: hashedPassword });

      await db('verification_codes').where({ user_id: user.id }).del();

      res.json({ success: true, message: "Password updated successfully." });
      const msg = {
        to: email,
        from: 'admin@a1dos-creations.com',
        subject: `${user.name} Password Change Verification Code`,
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
                <div style="font-size:24px">For account: <strong>${user.name} (${email})</strong></div>
                <div style="font-size:24px">Your A1 account password has been changed.</div>
                <table align="center" style="margin-top:8px">
                <tbody><tr style="line-height:normal">
                <td align="right" style="padding-right:8px">
                </td>
                </tr>
                </tbody>
                </table>
                </div>
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, reset your password immediately. Please review your account activity.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/account" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Check activity</a>
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
            console.error("SendGrid Error:", error.response.body);
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
    // Insert new user with email_notifications set to true by default
    const [newUser] = await db('users')
      .insert({
        name: name.trim(),
        email: email.trim(),
        password: hashedPassword,
        email_notifications: true
      })
      .returning(['id', 'name', 'email', 'email_notifications', 'created_at']);

    const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '1d' });

    const msg = {
      to: email,
      from: 'admin@a1dos-creations.com',
      subject: `🚀 Welcome to A1dos Creations, ${name}! ✨`,
      html: `
        <h1 style="font-size:20px;font-family: sans-serif;">🚀 Welcome to A1dos Creations, ${name}! ✨</h1>
        <br>
        <p>Be sure to check out your account dashboard:</p>
        <br>
        <a href="https://a1dos-creations.com/account/account" style="font-size:16px;font-family: sans-serif; background-color:blue; padding: 5px 15px; text-decoration:none; color:white; border-radius:8px;">Account Dashboard</a>
        <br>
        <p>Currently, linking Google accounts is unavailable due to verification in progress. We will email you when it's up! 🚀</p>
      `,
      trackingSettings: {
        clickTracking: { enable: false, enableText: false }
      }
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
    return res.status(500).json('Error registering user');
  }
});


app.post('/login-user', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json('Please provide email and password');
  }
  try {
    const user = await db('users')
      .select('id', 'name', 'email', 'password', 'email_notifications')
      .where({ email: email.trim() })
      .first();

    if (!user) {
      return res.status(400).json('Email or password is incorrect');
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      return res.status(400).json('Email or password is incorrect');
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ user: { name: user.name, email: user.email, email_notifications: user.email_notifications }, token });
    if(newUser.email_notifications){
    const msg = {
      to: email,
      from: 'admin@a1dos-creations.com',
      subject: `🚀 New login for user: ${user.name} ✨`,
      html: `
      <h1 style="font-size:20px;font-family: sans-serif;">🚀 Welcome Back, ${user.name}! ✨</h1>
      <br>
      <p>Be sure to check out your account dashboard:</p>
      <br>
      <br>
      <a href="https://a1dos-creations.com/account/account" style="font-size:16px;font-family: sans-serif;justify-self:center;text-align:center;background-color:blue;padding: 5px 15px;text-decoration:none;color:white;border-style:none;border-radius:8px;">Account Dashboard</a>
      <br>
      <br>
      <p>Currently, linking Google accounts is unavailable due to verification in progress. We will email you when it's up! 🚀</p>
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
  const scopes = [
    'https://www.googleapis.com/auth/classroom.courses.readonly', 
    'https://www.googleapis.com/auth/calendar'                    
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state; 

  if (!code) {
    return res.status(400).send("No code provided.");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("Google OAuth tokens:", tokens);
    
    if (userId) {
      await db('users').where({ id: userId }).update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date 
      });
    } else {
      console.error("No userId found in state parameter");
    }
    
    res.redirect('https://a1dos-creations.com/account/account?googleLinked=true');
  } catch (err) {
    console.error("Error exchanging code for token:", err);
    res.status(500).send("Authentication error");
  }
});

app.post('/verify-token', (req, res) => {
  const { token, email_notifications } = req.body;
  if (!token) return res.status(400).json({ valid: false, error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return res.status(401).json({ valid: false, error: "Invalid token" });
      res.json({ valid: true, user: decoded });
  });
  if(user.email_notifications){
  const msg = {
    to: email,
    from: 'admin@a1dos-creations.com',
    subject: `❗A Google Account Was Linked To Your A1dos Account.`,
    html: `
    <h1 style="font-size:20px;font-family: sans-serif;">A Google account has been linked to your A1dos Account. Was this you?</h1>
    <br>
    <p>Check your dashboard to unlink any connected google accounts. There you can also disable these emails.</p>
    <br>
    <br>
    <a href="https://a1dos-creations.com/account/account" style="font-size:16px;font-family: sans-serif;justify-self:center;text-align:center;background-color:blue;padding: 5px 15px;text-decoration:none;color:white;border-style:none;border-radius:8px;">Account Dashboard</a>
    <br>
    <br>
    <p>Currently, linking Google accounts is unavailable due to verification in progress. We will shoot you an email when it's up! 🚀</p>
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

      if(user.email_notifications) {
        const msg = {
          to: email,
          from: 'admin@a1dos-creations.com',
          subject: `✅ Nofications Restored!`,
          html: `
          <h1 style="font-size:20px;font-family: sans-serif;">You will now recieve alerts for Google accounts being linked, succesful signins, and welcome messages.</h1>
          <br>
          <p>Check your dashboard to customize your email preferences.</p>
          <br>
          <br>
          <a href="https://a1dos-creations.com/account/account" style="font-size:16px;font-family: sans-serif;justify-self:center;text-align:center;background-color:blue;padding: 5px 15px;text-decoration:none;color:white;border-style:none;border-radius:8px;">Account Dashboard</a>
          <br>
          <br>
          <p>Currently, linking Google accounts is unavailable due to verification in progress. We will shoot you an email when it's up! 🚀</p>
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
      res.json({ success: true, message: "Notification preferences updated." });
  } catch (error) {
      console.error("Error updating notifications:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// --- Stripe Integration Endpoint with user metadata ---
app.post('/create-checkout-session', async (req, res) => {
  const { token } = req.body; 
  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' });
  }
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Premium Feature'
          },
          unit_amount: 200,
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: 'https://a1dos-creations.com/success',
      cancel_url: 'https://a1dos-creations.com/cancel',
      metadata: {
        user_id
      }
    });
    console.log("Stripe Checkout session created:", session.id);
    res.json({ id: session.id });
  } catch (error) {
    console.error("Error creating Stripe Checkout session:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; 

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const { token } = req.body;
  let event;

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded.id;
  
  const user = await db('users').where({ id: userId }).first();
  if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
  }
  
  await db('users')
    .select('id', 'name', 'email', 'password', 'email_notifications')
    .where({ name: user.name })
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.user_id;
    
    console.log(`Payment succeeded for user ${userId}. Session ID: ${session.id}`);
    
    db('users')
      .where({ id: userId })
      .update({ premium: true })
      .then(() => {
        console.log(`User ${userId} updated with premium feature.`);
        if(user.email_notifications){
          const msg = {
            to: user.email,
            from: 'admin@a1dos-creations.com',
            subject: `Welcome Premium User! 🎉`,
            html: `
            <h1 style="font-size:20px;font-family: sans-serif;">Your account has been upgraded to Premium for $2 a month.</h1>
            <h2 style="font-size:16px;font-family: sans-serif;">Thank you for your purchase!</h2>
            <br>
            <p>If this was not you, please <a href="mailto:rbentertainmentinfo@gmail.com">contact support</a> and check your recent payments.</p>
            <br>
            <br>
            <a href="https://a1dos-creations.com/account/account" style="font-size:16px;font-family: sans-serif;justify-self:center;text-align:center;background-color:blue;padding: 5px 15px;text-decoration:none;color:white;border-style:none;border-radius:8px;">Account Dashboard</a>
            <br>
            <br>
            <p>Currently, linking Google accounts is unavailable due to verification in progress. We will shoot you an email when it's up! 🚀</p>
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
        })
        .catch(err => {
          console.error('Database update error:', err);
        });
      }
  
  res.json({ received: true });
});



const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));