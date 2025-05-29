// controllers/buttonController.js
import { query } from '../config/db.js'; // Your DB query function

export const createButton = async (req, res, next) => {
    const { url, text, icon, backgroundColor, textColor, isShared } = req.body;
    const userId = req.user.id; // From authenticateToken middleware

    if (!url || !text) {
        return res.status(400).json({ message: "URL and Text are required." });
    }

    try {
        // SQL to insert button - adapt to your schema
        const sql = `
            INSERT INTO buttons (user_id, url, text, icon, background_color, text_color, is_shared, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING id, url, text, icon, background_color, text_color, is_shared, created_at;
        `;
        // In a real setup, params would be an array: [userId, url, text, icon, backgroundColor, textColor, isShared]
        // For simulation:
        const mockButtonData = { userId, url, text, icon, backgroundColor, textColor, isShared, createdAt: new Date().toISOString() };
        const result = await query(sql, [mockButtonData]); // Pass mock data for simulation

        if (result.rowCount > 0) {
            res.status(201).json(result.rows[0]);
        } else {
            // This case should ideally not happen if RETURNING is used and insert is successful
            // For simulation, if query returns an empty result for insert:
            if(result.rows.length > 0) res.status(201).json(result.rows[0]);
            else res.status(500).json({ message: "Failed to create button, simulation error or DB error."})

        }
    } catch (error) {
        console.error("Error creating button:", error);
        next(error); // Pass to global error handler
    }
};

export const getUserButtons = async (req, res, next) => {
    const userId = req.user.id;
    try {
        // SQL to get user's buttons
        const sql = `SELECT id, url, text, icon, background_color, text_color, is_shared, created_at FROM buttons WHERE user_id = $1 ORDER BY created_at DESC;`;
        const result = await query(sql, [userId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching user buttons:", error);
        next(error);
    }
};

export const getDiscoverButtons = async (req, res, next) => {
    const { filter = 'new', page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let orderBy = 'created_at DESC'; // Default for 'new'
    // if (filter === 'featured') orderBy = 'some_featured_score DESC, created_at DESC'; // Implement featured logic
    // if (filter === 'favorites') { /* Requires user context and favorites table */ }


    try {
        // SQL for discover buttons, public and shared
        // Add actual filter logic here
        const sql = `
            SELECT id, url, text, icon, background_color, text_color, created_at 
            FROM buttons 
            WHERE is_shared = TRUE 
            ORDER BY ${orderBy} 
            LIMIT $1 OFFSET $2;
        `;
        const result = await query(sql, [parseInt(limit), offset]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error("Error fetching discover buttons:", error);
        next(error);
    }
};