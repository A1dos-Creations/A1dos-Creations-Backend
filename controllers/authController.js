// controllers/authController.js

export const getAuthStatus = (req, res) => {
    // If authenticateToken middleware passes, req.user is populated
    res.status(200).json({
        isAuthenticated: true,
        user: {
            id: req.user.id, // Or whatever identifier you store in the token
            // username: req.user.username (if available)
        }
    });
};