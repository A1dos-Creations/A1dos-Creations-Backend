import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import jwt from 'jsonwebtoken';
import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});

const router = express.Router();

function getUserEmail(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  
    const token = authHeader.split(' ')[1];
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded.email;
    } catch (err) {
      console.error("JWT verification failed:", err);
      return null;
    }
  }

router.get('/rsvp-data', async (req, res) => {
    const userEmail = getUserEmail(req);
    if (!userEmail) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
  
    if (userEmail !== 'rbentertainmentinfo@gmail.com') {
      return res.status(403).json({ success: false, message: "Access Denied" });
    }
  
    try {
      const rsvps = await db('rsvps').select('*');
      res.json({ success: true, rsvps });
    } catch (error) {
      console.error("Error fetching RSVPs:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

export default router;
