import express from 'express';
import { google } from 'googleapis';
import knex from 'knex';
import dotenv from 'dotenv';
dotenv.config();

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});
const router = express.Router();

router.post('/sync', async (req, res) => {
  try {
    const { courseId, assignmentId, aeriesSchoolId } = req.body;
    const accessToken = req.headers.authorization?.split(' ')[1];

    if (!accessToken) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    oauth2Client.setCredentials({ access_token: accessToken });

    const classroom = google.classroom({ version: 'v1', auth: oauth2Client });

    // Fetch student grades from Google Classroom
    const response = await classroom.courses.courseWork.studentSubmissions.list({
      courseId,
      courseWorkId: assignmentId
    });

    const submissions = response.data.studentSubmissions || [];

    // Process each student's grade
    for (const submission of submissions) {
      if (!submission.userId || !submission.assignedGrade) continue;

      // Fetch student info (match to Aeries)
      const studentResponse = await classroom.userProfiles.get({
        userId: submission.userId
      });

      const studentEmail = studentResponse.data.emailAddress;
      const grade = submission.assignedGrade;

      const studentQuery = await db.query(
        'SELECT aeries_student_id FROM students WHERE email = $1 AND school_id = $2',
        [studentEmail, aeriesSchoolId]
      );

      if (studentQuery.rows.length > 0) {
        const aeriesStudentId = studentQuery.rows[0].aeries_student_id;

        await fetch(`https://aeriesapi.ccusd.org/api/grades`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: aeriesStudentId,
            assignmentId,
            grade
          })
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error syncing grades:', error);
    res.status(500).json({ error: 'Failed to sync grades' });
  }
});

export default router;
