// routes/authRoutes.js
import express from 'express';
import { getAuthStatus } from '../controllers/authController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Endpoint to check if the current token is valid
router.get('/status', authenticateToken, getAuthStatus);

// Note: Actual login (POST /auth/login) and registration (POST /auth/register)
// would likely be handled by your main auth system at a1dos-creations.com/account/auth.
// This API mainly consumes the token issued by that system.

export default router;