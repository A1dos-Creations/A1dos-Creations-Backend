import express from 'express';
const router = express.Router();
import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});

router.get('/:uniqueId', async (req, res) => {
  const { uniqueId } = req.params;

  try {
    const movie = await db('movies').where({ unique_id: uniqueId }).first();
    if (!movie) {
      return res.status(404).send("Movie not found");
    }
    
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <title>${movie.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
          </style>
      </head>
      <body>
          <h1>${movie.title}</h1>
          <p>${movie.description}</p>
          <p><strong>Release Date:</strong> ${movie.release_date ? movie.release_date.toString() : "N/A"}</p>

          <form id="rsvpForm-UNIQUE_ID" onsubmit="submitRSVP(event, 'UNIQUE_ID')">
            <input type="text" name="name" placeholder="Your Name" required>
            <input type="text" name="guests" placeholder="Number of Guests" required>
            <button type="submit">RSVP</button>
          </form>
          <p id="rsvpStatus-UNIQUE_ID"></p>
      </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    console.error("Error fetching movie:", error);
    res.status(500).send("Internal server error");
  }
});

export default router;
