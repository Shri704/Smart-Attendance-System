// Custom admin login logic
$('.js-tilt').tilt({ scale: 1.1 });

function validate() {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (username === "admin" && password === "admin") {
        window.location.href = "dashboard.html";
    } else {
        alert("Invalid Credentials");
    }
} 