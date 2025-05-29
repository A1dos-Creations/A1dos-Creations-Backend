// routes/buttonRoutes.js
import express from 'express';
import {
    createButton,
    getUserButtons,
    getDiscoverButtons
    // getButtonById, updateButton, deleteButton (implement if needed)
} from '../controllers/buttonController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { validateUrl } from '../middleware/checkUrlMiddleware.js';

const router = express.Router();

// Create a new button
router.post('/', authenticateToken, validateUrl, createButton);

// Get all buttons for the authenticated user
router.get('/my', authenticateToken, getUserButtons);

// Get buttons for the discover page (publicly shared)
// Authentication might be optional here, or used to personalize (e.g., "favorites")
router.get('/discover', getDiscoverButtons); // authenticateToken can be added if needed for all discover types

// Optional: Routes for specific button management
// router.get('/:id', authenticateToken, getButtonById);
// router.put('/:id', authenticateToken, validateUrl, updateButton);
// router.delete('/:id', authenticateToken, deleteButton);

export default router;