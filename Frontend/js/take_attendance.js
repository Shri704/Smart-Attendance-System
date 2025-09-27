// Check if user is logged in
if (!sessionStorage.getItem('loggedIn')) {
    window.location.href = "index.html";
}

// DOM Elements
const attendanceForm = document.getElementById('attendanceForm');
const subjectsInput = document.getElementById('subjects');
const startTimeInput = document.getElementById('startTime');
const logoutBtn = document.getElementById('logoutBtn');

// API Base URL
const API_BASE_URL = 'http://localhost:8080';

// Handle form submission
attendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const subjects = subjectsInput.value.trim();
    const startTime = startTimeInput.value;
    
    if (!subjects || !startTime) {
        showError('Please fill in all fields');
        return;
    }

    try {
        // Send request to start attendance process
        const response = await fetch(`${API_BASE_URL}/attendance/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                subjects: subjects.split(',').map(s => s.trim()),
                startTime: startTime
            })
        });

        if (!response.ok) {
            throw new Error('Failed to start attendance process');
        }

        // Show success message
        alert('Attendance process started successfully! The camera will open shortly.');
        
        // Disable form while attendance is in progress
        attendanceForm.querySelectorAll('input, button').forEach(el => el.disabled = true);
        
    } catch (error) {
        console.error('Error:', error);
        showError('Failed to start attendance process. Please try again.');
    }
});

// Logout functionality
logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem('loggedIn');
    window.location.href = 'index.html';
});

// Error handling
function showError(message) {
    alert(message);
} 