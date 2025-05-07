// backend/dbStore.js
// Interacts with the PostgreSQL database for board and element data.
const db = require('./db'); // Use the pooled connection

// Helper function to ensure a board exists in the DB
// Returns true if board exists or was created, throws error otherwise
async function ensureBoardExists(boardId) {
    // Basic UUID validation (adjust regex if needed for stricter format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!boardId || !uuidRegex.test(boardId)) {
        console.error(`Invalid board ID format received: ${boardId}`);
        throw new Error(`Invalid board ID format.`);
    }

    const insertQuery = 'INSERT INTO boards (id) VALUES ($1) ON CONFLICT (id) DO NOTHING';
    try {
        // Attempt to insert. If it conflicts, the board already exists.
        await db.query(insertQuery, [boardId]);
        // console.log(`Ensured board ${boardId} exists (created if new).`);
        return true;
    } catch (err) {
        console.error(`Error ensuring board ${boardId} exists:`, err.message);
        // Rethrow unexpected errors
        throw err;
    }
}


// Fetches all elements for a given board
async function getBoardElements(boardId) {
    if (!boardId) {
        console.error("getBoardElements called with null or undefined boardId");
        return []; // Return empty array if boardId is invalid
    }
    try {
        // Ensure the board exists first. If ensureBoardExists throws, this will stop.
        await ensureBoardExists(boardId);

        const query = 'SELECT id, element_type, data FROM elements WHERE board_id = $1 ORDER BY created_at ASC';
        const { rows } = await db.query(query, [boardId]);

        // Combine id, type, and data into the structure expected by the frontend
        return rows.map(row => ({
            id: row.id,
            type: row.element_type,
            ...row.data // Spread the JSONB data containing x, y, text, src, points, etc.
        }));
    } catch (err) {
        console.error(`Error fetching elements for board ${boardId}:`, err.message);
        // If the error came from ensureBoardExists (invalid ID), rethrow or handle
        if (err.message.includes('Invalid board ID format')) {
            throw err; // Let the caller handle invalid ID
        }
        // For other errors (DB connection etc), return empty or throw
        return []; // Return empty on other fetch errors for now
    }
}

// Adds a new element to a board
async function addElement(boardId, element) {
    if (!boardId || !element || !element.id || !element.type) {
        console.error('Invalid data for addElement:', { boardId, elementId: element?.id });
        return false;
    }

    try {
        // Ensure the board exists before adding an element. If it throws, we stop.
        await ensureBoardExists(boardId);

        const { id, type, ...data } = element; // Separate id/type from the rest of the data
        const query = `
            INSERT INTO elements (id, board_id, element_type, data)
            VALUES ($1, $2, $3, $4)
            RETURNING id;
        `;
        // The 'data' field in the table expects a JSONB object
        const { rows } = await db.query(query, [id, boardId, type, data]);
        // console.log(`[${boardId}] Added element: ${rows[0]?.id}`);
        return !!rows[0]; // Return true if insertion was successful
    } catch (err) {
        console.error(`Error adding element ${element.id} to board ${boardId}:`, err);
        // Handle potential constraint violations (e.g., duplicate element ID)
        if (err.code === '23505') { // Unique violation (duplicate element ID)
             console.warn(`Attempted to add duplicate element ID: ${element.id}`);
             return false; // Indicate failure to add as new
        }
        if (err.code === '23503') { // Foreign key violation (board_id likely doesn't exist despite check - race condition?)
             console.error(`Board with ID ${boardId} not found for adding element ${element.id}. This shouldn't happen if ensureBoardExists worked.`);
             return false;
        }
        // Rethrow other errors or return false
        return false;
    }
}

// Updates an existing element on a board
async function updateElement(boardId, element) {
    if (!boardId || !element || !element.id || !element.type) {
        console.error('Invalid data for updateElement:', { boardId, elementId: element?.id });
        return false;
    }

    try {
        const { id, type, ...data } = element;
        // Note: The trigger 'trigger_elements_updated_at' handles the updated_at timestamp
        const query = `
            UPDATE elements
            SET element_type = $1, data = $2
            WHERE id = $3 AND board_id = $4
            RETURNING id;
        `;
        const { rowCount } = await db.query(query, [type, data, id, boardId]);

        if (rowCount > 0) {
             // console.log(`[${boardId}] Updated element: ${id}`);
             return true;
        } else {
            console.warn(`[${boardId}] Element not found for update or board ID mismatch: ${id}`);
            return false;
        }
    } catch (err) {
        console.error(`Error updating element ${element.id} on board ${boardId}:`, err);
        return false;
    }
}

// Deletes an element from a board
async function deleteElement(boardId, elementId) {
    if (!boardId || !elementId) {
        console.error('Invalid data for deleteElement:', { boardId, elementId });
        return false;
    }
    try {
        const query = 'DELETE FROM elements WHERE id = $1 AND board_id = $2 RETURNING id';
        const { rowCount } = await db.query(query, [elementId, boardId]);

        if (rowCount > 0) {
            // console.log(`[${boardId}] Deleted element: ${elementId}`);
            return true;
        } else {
            console.warn(`[${boardId}] Element not found for deletion: ${elementId}`);
            return false; // Element didn't exist or board ID mismatch
        }
    } catch (err) {
        console.error(`Error deleting element ${elementId} from board ${boardId}:`, err);
        return false;
    }
}

module.exports = {
    getBoardElements,
    addElement,
    updateElement,
    deleteElement,
};