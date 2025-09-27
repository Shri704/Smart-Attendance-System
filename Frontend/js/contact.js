document.getElementById("contactForm").addEventListener("submit", function (e) {
  e.preventDefault();

  // Optional: You can handle backend submission here using fetch()
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const message = document.getElementById("message").value.trim();

  if (!name || !email || !message) return;

  // Simulate form sending
  setTimeout(() => {
    document.getElementById("statusMessage").classList.remove("d-none");
    this.reset();
  }, 500);
});
