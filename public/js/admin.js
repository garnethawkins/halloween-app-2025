let currentAddresses = [];
const addressList = document.getElementById('address-list');
const statusEl = document.getElementById('status');

// --- Data and API Functions ---

const fetchAddresses = async () => {
    const response = await fetch('/api/addresses');
    currentAddresses = await response.json();
    renderAddresses();
};

const saveAddresses = async () => {
    const response = await fetch('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: currentAddresses })
    });
    const result = await response.json();
    statusEl.textContent = result.message;
    setTimeout(() => statusEl.textContent = '', 3000);
    fetchAddresses(); // Re-fetch to ensure sync with server
};

// --- Rendering and UI Functions ---

const renderAddresses = () => {
    addressList.innerHTML = ''; // Clear the list
    currentAddresses.forEach((address, index) => {
        const li = document.createElement('li');
        li.dataset.index = index;

        const span = document.createElement('span');
        span.textContent = address.text;
        if (address.instructions) {
            const instructionsSpan = document.createElement('span');
            instructionsSpan.className = 'instructions-display';
            instructionsSpan.textContent = `Instructions: ${address.instructions}`;
            span.appendChild(document.createElement('br'));
            span.appendChild(instructionsSpan);
        }

        const controls = document.createElement('div');
        controls.className = 'controls';

        const editButton = document.createElement('button');
        editButton.textContent = 'Edit';
        editButton.onclick = () => handleEdit(index);

        const setLocationButton = document.createElement('button');
        setLocationButton.textContent = 'Set Location';
        setLocationButton.onclick = () => openLocationModal(index);

        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.className = 'delete';
        deleteButton.onclick = () => handleDelete(index);

        controls.append(setLocationButton, editButton, deleteButton);
        li.append(span, controls);
        addressList.appendChild(li);
    });
};

const handleEdit = (index) => {
    const li = addressList.querySelector(`li[data-index='${index}']`);
    const span = li.querySelector('span');
    let fullAddress = currentAddresses[index].text; // Use the original data, not the rendered text
    const locationSuffix = " ardlethan nsw 2665";

    // Show only the street part in the edit box if the address ends with the suffix
    let streetPart = fullAddress;
    // Repeatedly strip the suffix in case it has been duplicated.
    while (streetPart.toLowerCase().endsWith(locationSuffix)) {
        streetPart = fullAddress.substring(0, fullAddress.length - locationSuffix.length).trim();
        fullAddress = streetPart; // Update fullAddress for the next loop iteration
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.value = streetPart;
    input.className = 'edit-input';

    const instructionsInput = document.createElement('input');
    instructionsInput.type = 'text';
    instructionsInput.placeholder = 'Special instructions';
    instructionsInput.value = currentAddresses[index].instructions || '';
    instructionsInput.className = 'edit-input';

    const saveButton = document.createElement('button');
    saveButton.textContent = 'Save';
    saveButton.onclick = () => {
        const oldAddressText = currentAddresses[index].text;
        const newStreetPart = input.value.trim();
        const newInstructions = instructionsInput.value.trim();
        const newAddressText = `${newStreetPart} ${locationSuffix}`;

        // Only clear coordinates if the address text has actually changed
        if (newAddressText !== oldAddressText) {
            // Clear old coordinates to signal server to re-geocode
            delete currentAddresses[index].lat;
            delete currentAddresses[index].lon;
        }

        currentAddresses[index].text = newAddressText;
        currentAddresses[index].instructions = newInstructions || undefined; // Save new instructions, or remove if empty
        saveAddresses();
    };

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'delete';
    cancelButton.onclick = () => renderAddresses(); // Just re-render to cancel

    const controls = li.querySelector('.controls');
    controls.innerHTML = '';
    controls.append(saveButton, cancelButton);

    // Replace the span with the new input fields
    span.innerHTML = ''; // Clear the old content
    span.appendChild(input);
    span.appendChild(instructionsInput);
    input.focus();
};

const handleDelete = (index) => {
    if (confirm(`Are you sure you want to delete "${currentAddresses[index].text}"?`)) {
        currentAddresses.splice(index, 1);
        saveAddresses();
    }
};

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', async () => {
    fetchAddresses();

    const rulesResponse = await fetch('/api/rules');
    const rulesData = await rulesResponse.json();
    document.getElementById('rules-content').value = rulesData.rules;
});

document.getElementById('signout-btn').addEventListener('click', async () => {
    try {
        const response = await fetch('/api/signout', { method: 'POST' });
        const result = await response.json();
        if (result.success) {
            window.location.href = '/'; // Redirect to landing page on successful sign out
        }
    } catch (error) {
        console.error('Sign out failed:', error);
    }
});

document.getElementById('add-address-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const newAddressInput = document.getElementById('new-address');
    const newInstructionsInput = document.getElementById('new-instructions');
    const streetAddress = newAddressInput.value.trim();
    if (streetAddress) {
        const locationSuffix = "ardlethan nsw 2665";
        const fullAddress = `${streetAddress} ${locationSuffix}`;
        const instructions = newInstructionsInput.value.trim();
        currentAddresses.push({ text: fullAddress, instructions: instructions || undefined });
        saveAddresses();
        newAddressInput.value = ''; // Clear input field
        newInstructionsInput.value = '';
    }
});

document.getElementById('rules-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rulesContent = document.getElementById('rules-content').value;
    const response = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: rulesContent })
    });

    const result = await response.json();
    const rulesStatusEl = document.getElementById('rules-status');
    rulesStatusEl.textContent = result.message;
    rulesStatusEl.style.color = 'green';
    setTimeout(() => rulesStatusEl.textContent = '', 3000);
});

// --- Password Change Modal Logic ---
const passwordModal = document.getElementById('password-modal');
const openPasswordModalBtn = document.getElementById('open-password-modal-btn');
const closePasswordBtn = document.querySelector('#password-modal .close-password');
const passwordForm = document.getElementById('change-password-form');
const passwordStatusEl = document.getElementById('password-status');

openPasswordModalBtn.onclick = () => {
    passwordModal.style.display = 'block';
    passwordStatusEl.textContent = '';
    passwordForm.reset();
};

closePasswordBtn.onclick = () => {
    passwordModal.style.display = 'none';
};

passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    passwordStatusEl.textContent = '';

    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
        passwordStatusEl.style.color = 'red';
        passwordStatusEl.textContent = 'New passwords do not match.';
        return;
    }

    if (newPassword.length < 8) {
        passwordStatusEl.style.color = 'red';
        passwordStatusEl.textContent = 'New password must be at least 8 characters long.';
        return;
    }

    const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
    });

    const result = await response.json();

    if (result.success) {
        passwordStatusEl.style.color = 'green';
        passwordStatusEl.textContent = result.message;
        setTimeout(() => passwordModal.style.display = 'none', 2000);
    } else {
        passwordStatusEl.style.color = 'red';
        passwordStatusEl.textContent = result.message;
    }
});

// --- Modal and Map Logic ---
const modal = document.getElementById('location-modal');
const closeBtn = document.querySelector('.modal .close');
let locationMap = null;
let currentMarker = null;
let editingIndex = -1;

closeBtn.onclick = () => modal.style.display = "none";
window.onclick = (event) => {
    if (event.target == modal || event.target == passwordModal) {
        modal.style.display = "none";
    }
};

async function openLocationModal(index) {
    editingIndex = index;
    const address = currentAddresses[index];
    modal.style.display = "block";

    if (!locationMap) { // Initialize map only once
        locationMap = L.map('location-map').setView([-33.8688, 151.2093], 10); // Default to Sydney
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(locationMap);

        locationMap.on('click', (e) => {
            if (currentMarker) {
                currentMarker.setLatLng(e.latlng);
            } else {
                currentMarker = L.marker(e.latlng).addTo(locationMap);
            }
        });
    }

    // Invalidate map size to ensure it renders correctly inside the modal
    setTimeout(() => {
        locationMap.invalidateSize();
    }, 10);

    if (currentMarker) {
        locationMap.removeLayer(currentMarker);
        currentMarker = null;
    }

    if (address.lat && address.lon) {
        const latLng = [address.lat, address.lon];
        currentMarker = L.marker(latLng).addTo(locationMap);
        locationMap.setView(latLng, 15);
    } else {
        // Geocode the address to get a starting position for the map
        try {
            const geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=au&q=${encodeURIComponent(address.text)}`, {
                headers: { 'User-Agent': 'HalloweenApp/1.0 (https://example.com/)' }
            });
            const geoData = await geoResponse.json();

            if (geoData && geoData.length > 0) {
                const { lat, lon } = geoData[0];
                locationMap.setView([lat, lon], 13); // Zoom to the geocoded location
            } else {
                locationMap.setView([-33.8688, 151.2093], 10); // Fallback to Sydney
            }
        } catch (error) {
            console.error('Error geocoding for modal map:', error);
            locationMap.setView([-33.8688, 151.2093], 10); // Fallback on error
        }
    }
}

document.getElementById('save-location-btn').onclick = () => {
    if (currentMarker && editingIndex > -1) {
        const { lat, lng } = currentMarker.getLatLng();
        currentAddresses[editingIndex].lat = lat;
        currentAddresses[editingIndex].lon = lng;
        saveAddresses();
        modal.style.display = "none";
    }
};