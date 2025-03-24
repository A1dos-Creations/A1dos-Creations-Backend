import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});

const router = express.Router();

router.post('/rsvp', requireAuth, async (req, res) => {
  try {
    const userEmail = req.user.email; 

    const { uniqueId, name, guests } = req.body;
    if (!uniqueId || !name || !guests) {
      return res.status(400).json({ success: false, message: "Missing fields." });
    }

    await db('rsvps').insert({
      event_id: uniqueId,
      name,
      guests: parseInt(guests),
      user_email: userEmail
    });

    res.json({ success: true, message: "RSVP saved." });
  } catch (error) {
    console.error("Error saving RSVP:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});
router.get('/rsvp-data', requireAuth, async (req, res) => {
  try {
    if (req.user.email !== 'rbentertainmentinfo@gmail.com') {
      return res.status(403).json({ success: false, message: "Access Denied" });
    }

    const rsvps = await db('rsvps').select('*');
    res.json({ success: true, rsvps });
  } catch (error) {
    console.error("Error fetching RSVPs:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});