const attendanceForm = document.getElementById('attendanceForm');
const startBtn = document.getElementById('startBtn');
const testCameraBtn = document.getElementById('testCameraBtn');
const statusMessage = document.getElementById('statusMessage');
const customLoader = document.getElementById('customLoader');
const downloadSection = document.getElementById('downloadSection');
const downloadBtn = document.getElementById('downloadBtn');
const semesterSelect = document.getElementById('semesterSelect');
const branchSelect = document.getElementById('branchSelect');
const subjectSelect = document.getElementById('subjectSelect');
const timingSelect = document.getElementById('timing');
const videoFeed = document.getElementById('videoFeed');
const lensSpinner = document.getElementById('lensSpinner');

let currentExcelFile = null;
let cameraStream = null;

document.addEventListener('DOMContentLoaded', () => {
    subjectSelect.disabled = true;
    timingSelect.disabled = true;
    testCameraBtn.disabled = true;
    startBtn.disabled = true;
    if (lensSpinner) lensSpinner.style.display = "none";
    loadAttendanceRecords();
});

async function loadAttendanceRecords() {
    try {
        const response = await fetch('http://127.0.0.1:8080/api/attendance');
        if (!response.ok) throw new Error('Failed to fetch records');
        const records = await response.json();

        const tbody = document.querySelector('#attendanceTable tbody');
        tbody.innerHTML = '';
        if (records.length === 0) {
            document.getElementById('attendanceRecordsSection').style.display = 'none';
            return;
        }

        records.forEach(record => {
            const row = `<tr>
                <td>${record.name || ''}</td>
                <td>${record.roll_no || ''}</td>
                <td>${record.subject || ''}</td>
                <td>${record.semester || ''}</td>
                <td>${record.timing || ''}</td>
                <td>${record.date || ''}</td>
            </tr>`;
            tbody.innerHTML += row;
        });

        document.getElementById('attendanceRecordsSection').style.display = 'block';
    } catch (err) {
        document.getElementById('attendanceRecordsSection').style.display = 'none';
        console.error("Error loading attendance records:", err);
    }
}

// Load subjects based on semester and branch
semesterSelect.addEventListener('change', loadSubjects);
branchSelect.addEventListener('change', loadSubjects);

async function loadSubjects() {
    const semester = semesterSelect.value;
    const branch = branchSelect.value;

    subjectSelect.innerHTML = '<option value="">Select Subject</option>';
    subjectSelect.disabled = true;

    if (!semester || !branch) {
        timingSelect.disabled = true;
        testCameraBtn.disabled = true;
        startBtn.disabled = true;
        return;
    }

    try {
        const res = await fetch(`http://127.0.0.1:8080/subjects/getbysemesterandbranch/${semester}/${branch}`);
        const subjects = await res.json();

        if (!Array.isArray(subjects)) {
            throw new Error("Invalid subject data from server");
        }

        if (subjects.length > 0) {
            subjectSelect.innerHTML = '<option value="">Select Subject</option>';
            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.code;
                option.textContent = `${subject.code} - ${subject.name}`;
                subjectSelect.appendChild(option);
            });
            subjectSelect.disabled = false;
        } else {
            subjectSelect.innerHTML = '<option value="">No subjects found</option>';
        }
    } catch (err) {
        subjectSelect.innerHTML = '<option value="">Error loading subjects</option>';
        console.error("Subject fetch error:", err);
    }

    timingSelect.disabled = false;
    checkFormCompletion();
}

subjectSelect.addEventListener('change', checkFormCompletion);
timingSelect.addEventListener('change', checkFormCompletion);

function checkFormCompletion() {
    const isComplete = semesterSelect.value && branchSelect.value && subjectSelect.value && timingSelect.value;
    testCameraBtn.disabled = !isComplete;
    startBtn.disabled = !isComplete;
}

// Start camera preview
async function startCameraPreview() {
    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoFeed.srcObject = cameraStream;
        videoFeed.style.display = 'block';
    } catch (error) {
        showStatus('Camera access denied or not available.', true);
        console.error("Camera error:", error);
    }
}

// Stop camera stream
function stopCameraPreview() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        videoFeed.srcObject = null;
        videoFeed.style.display = 'none';
        cameraStream = null;
    }
}

// Test Camera Button
testCameraBtn.addEventListener('click', async () => {
    showStatus('', false);
    showLoading(true);
    await startCameraPreview();
    showLoading(false);
    showStatus('Camera preview started. If you see yourself, camera is working!');
});

// Handle Attendance Form Submit
attendanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const semester = semesterSelect.value;
    const branch = branchSelect.value;
    const subject = subjectSelect.value;
    const timing = timingSelect.value;

    if (!semester || !branch || !subject || !timing) {
        showStatus('Please select semester, branch, subject, and timing', true);
        return;
    }

    try {
        showStatus('', false);
        showLoading(true);

        const response = await fetch('http://127.0.0.1:8080/start-attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject_code: subject,
                semester,
                branch,
                timing,
                date: new Date().toISOString().split('T')[0]
            })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus('Attendance started successfully! Redirecting to dashboard...');
            downloadSection.style.display = 'block';
            currentExcelFile = data.excel_file;
            loadAttendanceRecords();
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } else {
            showStatus(data.error || 'Failed to start attendance', true);
        }
    } catch (error) {
        showStatus('Failed to connect to the server. Please try again.', true);
        console.error("Attendance error:", error);
    } finally {
        showLoading(false);
        stopCameraPreview();
    }
});

// Download Attendance Excel
downloadBtn.addEventListener('click', async () => {
    if (!currentExcelFile) {
        showStatus('No attendance file available to download', true);
        return;
    }

    try {
        const response = await fetch(`http://127.0.0.1:8080/download-attendance/${currentExcelFile}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentExcelFile;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        showStatus('Failed to download attendance file', true);
        console.error("Download error:", error);
    }
});

// Status Message Display
function showStatus(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.style.display = message ? 'block' : 'none';
    statusMessage.className = isError ? 'status-error mt-3' : 'status-success mt-3';
}

// Show/Hide Loading Spinner
function showLoading(show) {
    if (lensSpinner) {
        lensSpinner.style.display = show ? 'flex' : 'none';
    }
    startBtn.disabled = show;
    testCameraBtn.disabled = show;
}

window.addEventListener('beforeunload', stopCameraPreview);
