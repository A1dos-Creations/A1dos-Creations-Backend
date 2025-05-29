// middleware/checkUrlMiddleware.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let blockList = [];
try {
    const rawData = fs.readFileSync(path.join(__dirname, '../config/blockList.json'));
    blockList = JSON.parse(rawData);
} catch (error) {
    console.error("Failed to load URL blockList:", error);
    // Decide if you want the app to run without a blocklist or throw an error
}

export const validateUrl = (req, res, next) => {
    const { url } = req.body;
    if (!url) {
        return next(); // If no URL is provided in this request, skip (other validation might catch it)
    }

    const isBlocked = blockList.some(blockedItem => {
        try {
            const blockedDomain = new URL(blockedItem.startsWith('http') ? blockedItem : `http://${blockedItem}`).hostname;
            const requestDomain = new URL(url).hostname;
            // Simple domain match, can be made more sophisticated
            return requestDomain.includes(blockedDomain) || url.includes(blockedItem);
        } catch (e) {
            // Handle invalid URLs in blocklist or request gracefully
            console.warn(`Could not parse URL for blocking check: ${blockedItem} or ${url}`);
            return false;
        }
    });

    if (isBlocked) {
        return res.status(403).json({ message: "The provided URL is not allowed." });
    }

    next();
};