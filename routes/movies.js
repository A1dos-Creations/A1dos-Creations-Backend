import express from 'express';
import knex from 'knex';

const router = express.Router();

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});

router.get('/movie/:uniqueId', async (req, res) => {
    const { uniqueId } = req.params;  // This should match the route parameter
    try {
      const movie = await db('movies').where({ unique_id: uniqueId }).first();
      if (!movie) {
        return res.status(404).json({ error: 'Movie not found' });
      }
      res.json(movie);  // Return movie data as JSON
    } catch (error) {
      console.error("Error fetching movie:", error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

export default router;