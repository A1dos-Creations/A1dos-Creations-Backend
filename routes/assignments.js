import express from 'express';
import { google } from 'googleapis';

const router = express.Router();

router.get('/assignments/:courseId', async (req, res) => {
  try {
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    oauth2Client.setCredentials({ access_token: accessToken });

    const classroom = google.classroom({ version: 'v1', auth: oauth2Client });

    const { courseId } = req.params;

    const response = await classroom.courses.courseWork.list({
      courseId,
      pageSize: 20
    });

    res.json(response.data.courseWork || []);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

export default router;
