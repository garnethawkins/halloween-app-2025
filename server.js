// server.js
const express = require('express');
const fetch = require('node-fetch'); // We'll need fetch on the server
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

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

    // Middleware to parse URL-encoded bodies (as sent by HTML forms)
    app.use(express.urlencoded({ extended: true }));

    // Middleware to parse JSON bodies (for API requests)
    app.use(express.json());

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
    app.post('/api/rules', async (req, res) => {
        const { rules } = req.body;
        if (typeof rules === 'string') {
            db.data.rules = rules;
            await db.write();
            res.json({ success: true, message: 'Rules updated successfully.' });
        } else {
            res.status(400).json({ success: false, message: 'Invalid data format. Expected a string for rules.' });
        }
    });

    // API endpoint to update addresses
    app.post('/api/addresses', async (req, res) => {
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
            res.status(400).json({ success: false, message: 'Invalid data format. Expected an array of addresses.' });
        }
    });

    // Middleware to serve static files from the 'public' directory
    app.use(express.static(path.join(__dirname, 'public')));

    // Route to handle the sign-in form submission
    app.post('/signin', async (req, res) => {
        const { username, password } = req.body;

        const isUsernameCorrect = process.env.ADMIN_USERNAME === username;
        let isPasswordCorrect = false;

        if (isUsernameCorrect) {
            // Compare the provided password with the stored hash
            isPasswordCorrect = await bcrypt.compare(password, db.data.adminPassword);
        }

        if (isUsernameCorrect && isPasswordCorrect) {
            console.log('Authentication successful. Redirecting to admin page.');
            res.redirect('/admin.html');
        } else {
            console.log('Authentication failed.');
            res.status(401).send('Authentication Failed. <a href="/signin.html">Try again</a>');
        }
    });

    // API endpoint to change the admin password
    app.post('/api/change-password', async (req, res) => {
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
