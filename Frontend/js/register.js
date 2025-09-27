// register.js

const video = document.getElementById('videoFeed');
const canvas = document.getElementById('canvas');
const capturedImage = document.getElementById('capturedImage');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');
const registrationForm = document.getElementById('registrationForm');

let stream = null;
let capturedImageData = null;

async function startVideo() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.style.display = 'block';
    canvas.style.display = 'none';
    captureBtn.style.display = 'block';
    retakeBtn.style.display = 'none';
  } catch (error) {
    Swal.fire('Error', 'Camera access denied.', 'error');
  }
}

captureBtn.addEventListener('click', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0);
  capturedImageData = canvas.toDataURL('image/jpeg');

  video.style.display = 'none';
  canvas.style.display = 'block';
  captureBtn.style.display = 'none';
  retakeBtn.style.display = 'block';

  capturedImage.src = capturedImageData;
  capturedImage.style.display = 'block';
});

retakeBtn.addEventListener('click', () => {
  video.style.display = 'block';
  canvas.style.display = 'none';
  capturedImage.style.display = 'none';
  captureBtn.style.display = 'block';
  retakeBtn.style.display = 'none';
  capturedImageData = null;
});

registrationForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!capturedImageData) {
    Swal.fire('Warning', 'Please capture your face photo first.', 'warning');
    return;
  }

  const formData = {
    rollNo: document.getElementById('rollNo').value.trim(),
    name: document.getElementById('name').value.trim(),
    branch: document.getElementById('branch').value,
    semester: document.getElementById('semester').value,
    faceImage: capturedImageData
  };

  try {
    const response = await fetch('http://127.0.0.1:8080/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    if (response.ok) {
      Swal.fire({
        title: 'Success!',
        text: 'Student registered successfully!',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      }).then(() => {
        stopCamera(); // stop camera before redirecting
        window.location.href = 'index.html';
      });
    } else {
      const errorData = await response.json();
      Swal.fire('Error', errorData.error || 'Registration failed.', 'error');
    }
  } catch (error) {
    Swal.fire('Error', 'Server connection failed.', 'error');
  }
});

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
}

document.addEventListener('DOMContentLoaded', startVideo);
window.addEventListener('beforeunload', stopCamera);
