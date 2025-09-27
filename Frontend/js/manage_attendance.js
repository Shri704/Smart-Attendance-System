document.addEventListener("DOMContentLoaded", () => {
  const semesterEl = document.getElementById("semester");
  const branchEl = document.getElementById("branch");
  const subjectEl = document.getElementById("subject");
  const rollEl = document.getElementById("roll");
  const nameEl = document.getElementById("name");
  const dateEl = document.getElementById("date");
  const statusEl = document.getElementById("status");
  const form = document.getElementById("attendanceForm");
  const messageBox = document.getElementById("message");

  // Load subjects based on semester and branch
  async function loadSubjects() {
    const semester = semesterEl.value.trim();
    const branch = branchEl.value.trim();

    if (!semester || !branch) {
      subjectEl.innerHTML = `<option value="">Select semester and branch first</option>`;
      subjectEl.disabled = true;
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:8080/subjects/getbysemesterandbranch/${semester}/${branch}`);
      const data = await res.json();

      if (Array.isArray(data)) {
        subjectEl.innerHTML = `<option value="">Select Subject</option>`;
        data.forEach(subject => {
          subjectEl.innerHTML += `<option value="${subject.code}">${subject.name} (${subject.code})</option>`;
        });
        subjectEl.disabled = false;
      } else {
        subjectEl.innerHTML = `<option value="">No subjects found</option>`;
        subjectEl.disabled = true;
      }
    } catch (err) {
      console.error("Error loading subjects:", err);
      subjectEl.innerHTML = `<option value="">Error loading subjects</option>`;
      subjectEl.disabled = true;
    }
  }

  semesterEl.addEventListener("change", () => {
    loadSubjects();
    tryFetchStudentName();
  });

  branchEl.addEventListener("change", () => {
    loadSubjects();
    tryFetchStudentName();
  });

  rollEl.addEventListener("blur", tryFetchStudentName);

  // Fetch student name
  async function tryFetchStudentName() {
    const roll = rollEl.value.trim();
    const semester = semesterEl.value.trim();
    const branch = branchEl.value.trim().toUpperCase();

    if (!roll || !semester || !branch) {
      nameEl.value = "";
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:8080/api/student?roll=${encodeURIComponent(roll)}&branch=${encodeURIComponent(branch)}&semester=${encodeURIComponent(semester)}`);
      if (res.ok) {
        const student = await res.json();
        nameEl.value = student.name || "";
      } else {
        nameEl.value = "";
        showMessage("❌ Student not found", true);
      }
    } catch (err) {
      console.error("Error fetching student:", err);
      nameEl.value = "";
      showMessage("❌ Error fetching student", true);
    }
  }

  // Set today's date
  dateEl.value = new Date().toISOString().split("T")[0];

  // Submit attendance
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const roll = rollEl.value.trim();
    const name = nameEl.value.trim();
    const semester = semesterEl.value;
    const branch = branchEl.value;
    const subject_code = subjectEl.value;
    const date = dateEl.value;
    const status = statusEl.value;

    if (!roll || !name || !semester || !branch || !subject_code || !date || !status) {
      showMessage("❌ Please fill all fields", true);
      return;
    }

    const payload = {
      roll: roll,
      roll_no: roll,
      name,
      semester,
      branch,
      subject_code,
      date,
      status
    };

    try {
      const res = await fetch("http://127.0.0.1:8080/api/save-attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();

      if (res.ok) {
        showMessage("✅ Attendance saved/updated");
        form.reset();
        dateEl.value = new Date().toISOString().split("T")[0];
        subjectEl.innerHTML = `<option value="">Select semester and branch first</option>`;
        subjectEl.disabled = true;

        // ✅ Let dashboard.html and report.html refresh attendance
        localStorage.setItem("attendance_updated", "true");
      } else {
        showMessage(`❌ ${result.message || "Error saving attendance"}`, true);
      }
    } catch (err) {
      console.error("Error saving attendance:", err);
      showMessage("❌ Failed to save attendance", true);
    }
  });

  function showMessage(msg, isError = false) {
    messageBox.textContent = msg;
    messageBox.className = `message-box ${isError ? "error" : "success"}`;
    setTimeout(() => {
      messageBox.textContent = "";
      messageBox.className = "message-box";
    }, 3000);
  }
});
