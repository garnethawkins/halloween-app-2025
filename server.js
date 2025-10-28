// server.js
const express = require('express');
const fetch = require('node-fetch'); // We'll need fetch on the server
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Security packages
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// lowdb uses ES Modules, so we need to import it asynchronously
// inside an async function.
async function startServer() {
    const { Low } = await import('lowdb');
    const { JSONFile } = await import('lowdb/node');

    // Configure lowdb to use db.json file
    const adapter = new JSONFile('db.json');
    const db = new Low(adapter, { addresses: [], rules: "", adminPassword: "password123" }); // Provide default data

    // Read data from db.json
    await db.read();

    // If db.json doesn't exist or is empty, set default data and write it.
    db.data = db.data || { addresses: [], rules: "", adminPassword: "password123" };

    // --- Password Hashing ---
    // Check if the password is not already hashed. bcrypt hashes start with '$2'.
    if (db.data.adminPassword && !db.data.adminPassword.startsWith('$2')) {
        console.log('Plaintext password found. Hashing and updating database.');
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(db.data.adminPassword, saltRounds);
        db.data.adminPassword = hashedPassword;
        await db.write(); // Save the hashed password
    }

    await db.write();

    // Helper function to add a delay
    const delay = ms => new Promise(res => setTimeout(res, ms));

    const app = express();
    const PORT = process.env.PORT || 3000; // Use PORT from .env, or default to 3000

    // Middleware to serve static files from the 'public' directory
    app.use(express.static(path.join(__dirname, 'public')));

    // --- Security Middleware Setup ---

    // 1. Helmet: Adds various security headers.
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "script-src": [
                    "'self'", // Allow scripts from our own server
                    "https://unpkg.com" // Allow scripts from unpkg CDN (for Leaflet)
                ],
                "style-src": [
                    "'self'", // Allow stylesheets from our own server
                    "https://unpkg.com" // Allow stylesheets from unpkg CDN (for Leaflet)
                ],
                "img-src": ["'self'", "data:", "*.tile.openstreetmap.org", "https://unpkg.com"],
                "connect-src": ["'self'", "https://nominatim.openstreetmap.org", "https://unpkg.com"],
            },
        },
    }));

    // 2. Body Parser Limits: Prevent large payloads from crashing the server.
    // Middleware to parse URL-encoded bodies (as sent by HTML forms)
    app.use(express.urlencoded({ extended: true }));
    // Middleware to parse JSON bodies (for API requests)
    app.use(express.json({ limit: '10kb' })); // Set a size limit

    // 3. Session Management
    // Note: For production, you'd want a more robust session store like connect-redis or connect-mongo.
    // The default memory store is not suitable for production as it will leak memory over time.
    app.use(session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
            httpOnly: true, // Prevents client-side JS from accessing the cookie
            maxAge: 1000 * 60 * 60 // 1 hour
        }
    }));

    // 4. Rate Limiting: Protect against brute-force attacks.
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // Limit each IP to 10 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        message: 'Too many login or password change attempts from this IP, please try again after 15 minutes'
    });

    // --- Authentication Middleware ---
    const isAuthenticated = (req, res, next) => {
        if (req.session.user) {
            return next();
        }
        // For API requests (which expect JSON), send a 401 Unauthorized error.
        // For direct browser navigation, redirect to the sign-in page.
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ success: false, message: 'Unauthorized. Please sign in.' });
        } else {
            return res.redirect('/signin.html');
        }
    };

    // --- API Routes ---

    // API endpoint to get all addresses
    app.get('/api/addresses', (req, res) => {
        const { addresses } = db.data;
        res.json(addresses);
    });

    // API endpoint to get the rules
    app.get('/api/rules', (req, res) => {
        const { rules } = db.data;
        res.json({ rules });
    });

    // API endpoint to update the rules
    app.post('/api/rules', isAuthenticated, async (req, res) => {
        const { rules } = req.body;
        if (typeof rules === 'string') {
            db.data.rules = rules;
            await db.write();
            res.json({ success: true, message: 'Rules updated successfully.' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid data format.' });
        }
    });

    // API endpoint to update addresses
    app.post('/api/addresses', isAuthenticated, async (req, res) => {
        const { addresses } = req.body;

        if (Array.isArray(addresses)) {
            // Geocode any new or updated addresses on the server
            for (const address of addresses) {
                // If an address has text but no coordinates, geocode it.
                if (address.text && (!address.lat || !address.lon)) {
                    try {
                        const geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=au&q=${encodeURIComponent(address.text)}`, {
                            headers: { 'User-Agent': 'HalloweenApp/1.0 (server-side)' }
                        });
                        const geoData = await geoResponse.json();

                        if (geoData && geoData.length > 0) {
                            address.lat = parseFloat(geoData[0].lat);
                            address.lon = parseFloat(geoData[0].lon);
                            console.log(`Geocoded "${address.text}" to [${address.lat}, ${address.lon}]`);
                        }
                        // Respect API rate limit
                        await delay(1000);
                    } catch (error) {
                        console.error('Error geocoding address on server:', address.text, error);
                    }
                }
            }

            db.data.addresses = addresses; // Save the updated array
            await db.write();
            res.json({ success: true, message: 'Addresses updated successfully.' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid data format.' });
        }
    });

    // Protect admin.html
    app.get('/admin.html', isAuthenticated, (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    });


    // Route to handle the sign-in form submission
    app.post('/signin', authLimiter, async (req, res) => {
        const { username, password } = req.body;

        const isUsernameCorrect = process.env.ADMIN_USERNAME === username;
        let isPasswordCorrect = false;

        if (isUsernameCorrect) {
            // Compare the provided password with the stored hash
            isPasswordCorrect = await bcrypt.compare(password, db.data.adminPassword);
        }

        if (isUsernameCorrect && isPasswordCorrect) {
            console.log('Authentication successful. Redirecting to admin page.');
            // Set session data
            req.session.user = true;
            res.redirect('/admin.html');
        } else {
            console.log('Authentication failed.');
            res.status(401).send('Authentication Failed. <a href="/signin.html">Try again</a>');
        }
    });

    // API endpoint to sign out
    app.post('/api/signout', (req, res) => {
        req.session.destroy(err => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Could not sign out.' });
            }
            res.json({ success: true, message: 'Signed out successfully.' });
        });
    });

    // API endpoint to change the admin password
    app.post('/api/change-password', isAuthenticated, authLimiter, async (req, res) => {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new passwords are required.' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long.' });
        }

        // 1. Verify the current password
        const isPasswordCorrect = await bcrypt.compare(currentPassword, db.data.adminPassword);

        if (!isPasswordCorrect) {
            return res.status(401).json({ success: false, message: 'Incorrect current password.' });
        }

        // 2. Hash the new password
        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // 3. Save the new hashed password
        db.data.adminPassword = hashedNewPassword;
        await db.write();

        res.json({ success: true, message: 'Password updated successfully.' });
    });

    // Start the server
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

startServer();
