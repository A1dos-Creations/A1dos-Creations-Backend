import express from 'express';
import { google } from 'googleapis';

const router = express.Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

router.get('/classes', async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.split(' ')[1];

    if (!accessToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    oauth2Client.setCredentials({ access_token: accessToken });

    const classroom = google.classroom({ version: 'v1', auth: oauth2Client });

    const response = await classroom.courses.list({
      teacherId: 'me',
      pageSize: 10
    });

    res.json(response.data.courses || []);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

export default router;
