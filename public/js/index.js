document.addEventListener('DOMContentLoaded', async () => {
    // Set the page title with the current year
    const year = new Date().getFullYear();
    document.getElementById('page-title').textContent = `Ardlethan Halloween ${year}`;

    // Hamburger menu logic
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mainNav = document.getElementById('main-nav');
    hamburgerBtn.addEventListener('click', () => {
        mainNav.classList.toggle('is-open');
    });

    // Initialize the map without a view
    const map = L.map('map');

    // Add the OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    // Fetch addresses from our API (they should already have coordinates)
    const response = await fetch('/api/addresses');
    let addresses = [];
    // If the user is not a logged-in admin, this will fail, which is okay.
    if (response.ok) {
        addresses = await response.json();
    }

    const markerCoords = [];

    // Add a marker for each address that has coordinates
    for (const address of addresses) {
        if (address.lat && address.lon) {
            const latLng = [address.lat, address.lon];
            let popupContent = `<b>${address.text}</b>`;
            if (address.instructions) {
                // Sanitize instructions before displaying to prevent HTML injection
                const sanitizedInstructions = address.instructions.replace(/</g, "&lt;").replace(/>/g, "&gt;");
                popupContent += `<br><br><i>${sanitizedInstructions}</i>`;
            }
            L.marker(latLng).addTo(map).bindPopup(popupContent);
            markerCoords.push(latLng);
        }
    }

    // If we have markers, fit them in the view
    if (markerCoords.length > 1) {
        map.fitBounds(markerCoords, { padding: [50, 50] });
    } else if (markerCoords.length === 1) {
        // If only one marker, center on it with a reasonable zoom level
        map.setView(markerCoords[0], 13);
    } else {
        // Fallback view if no addresses are found
        map.setView([-33.0, 146.9], 6);
    }
});