function validate(event) {
    event.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (username === "admin" && password === "admin123") {
        sessionStorage.setItem("loggedIn", "true");
        window.location.href = "attendance.html";
    } else {
        alert("Invalid credentials. Try again.");
    }
}
