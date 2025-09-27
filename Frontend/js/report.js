const semesterSelect = document.getElementById('semester');
const subjectSelect = document.getElementById('subject');
const rollSelect = document.getElementById('rollSelect');
const branchSelect = document.getElementById('branch');
const dateInput = document.getElementById('reportDate');
const reportTableContainer = document.getElementById('reportTableContainer');

window.onload = async () => {
  // ✅ Reload report if attendance was updated
  if (localStorage.getItem("attendance_updated") === "true") {
    await loadReport();
    localStorage.removeItem("attendance_updated");
  }

  // ✅ Load initial empty roll list
  rollSelect.innerHTML = '<option value="">All Students</option>';
};

// ----------------- SUBJECTS -----------------
async function fetchSubjects() {
  const semester = semesterSelect.value;
  const branch = branchSelect.value;

  subjectSelect.innerHTML = `<option value="">Loading...</option>`;

  if (!semester || !branch) {
    subjectSelect.innerHTML = `<option value="">Select Subject</option>`;
    return;
  }

  try {
    const res = await fetch(`http://127.0.0.1:8080/subjects/getbysemesterandbranch/${semester}/${branch}`);
    const subjects = await res.json();

    subjectSelect.innerHTML = `<option value="">All Subjects</option>`;
    subjects.forEach(sub => {
      const opt = document.createElement("option");
      opt.value = sub.code;
      opt.textContent = `${sub.name} (${sub.code})`;
      subjectSelect.appendChild(opt);
    });
  } catch (err) {
    subjectSelect.innerHTML = `<option>Error loading subjects</option>`;
  }
}

// ----------------- ROLL NUMBERS -----------------
async function fetchRollNumbers() {
  const semester = semesterSelect.value;
  const branch = branchSelect.value;

  rollSelect.innerHTML = '<option value="">Loading...</option>';

  if (!semester || !branch) {
    rollSelect.innerHTML = '<option value="">All Students</option>';
    return;
  }

  try {
    // ✅ Get students by semester
    const res = await fetch(`http://127.0.0.1:8080/students/getbysemester/${semester}`);
    const students = await res.json();

    // ✅ Filter by branch also
    const filtered = students.filter(s => s.branch === branch);

    rollSelect.innerHTML = '<option value="">All Students</option>';
    filtered.forEach(student => {
      const opt = document.createElement("option");
      opt.value = String(student.roll_no || student.roll);
      opt.textContent = String(student.roll_no || student.roll);
      rollSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load roll numbers", err);
    rollSelect.innerHTML = '<option>Error loading</option>';
  }
}

// ----------------- EVENT LISTENERS -----------------
semesterSelect.addEventListener("change", () => {
  fetchSubjects();
  fetchRollNumbers();  // ✅ also reload roll numbers
});
branchSelect.addEventListener("change", () => {
  fetchSubjects();
  fetchRollNumbers();  // ✅ also reload roll numbers
});

// ----------------- REPORT -----------------
async function loadReport() {
  const semester = semesterSelect.value;
  const subject = subjectSelect.value;
  const roll = rollSelect.value;
  const branch = branchSelect.value;
  const date = dateInput.value;

  if (!semester || !date) {
    alert("Please select both Semester and Date");
    return;
  }

  try {
    const studentsRes = await fetch(`http://127.0.0.1:8080/students/getbysemester/${semester}`);
    const students = await studentsRes.json();
    const filteredStudents = students.filter(s =>
      (!branch || s.branch === branch) && (!roll || String(s.roll_no || s.roll) === roll)
    );

    const subjectsRes = await fetch(`http://127.0.0.1:8080/subjects/getbysemester/${semester}`);
    const subjects = await subjectsRes.json();
    const subjectCodes = subjects.map(s => s.code);
    const subjectNames = {};
    subjects.forEach(s => subjectNames[s.code] = s.name);

    const attRes = await fetch(`http://127.0.0.1:8080/mark/get?date=${date}&semester=${semester}`);
    const attendance = await attRes.json();

    const table = document.createElement("table");
    table.className = "report-table";

    let thead = `<thead><tr><th>Roll No</th><th>Name</th><th>Branch</th>`;
    subjectCodes.forEach(code => {
      if (!subject || subject === code) {
        thead += `<th>${subjectNames[code]}<br>(${code})</th>`;
      }
    });
    thead += `<th>Total Present</th><th>Percentage</th></tr></thead>`;
    table.innerHTML = thead;

    const tbody = document.createElement("tbody");

    filteredStudents.forEach(student => {
      const rollNo = String(student.roll_no || student.roll);
      let row = `<tr><td>${rollNo}</td><td>${student.name}</td><td>${student.branch}</td>`;
      let presentCount = 0;
      let totalSubjects = 0;

      subjectCodes.forEach(code => {
        if (!subject || subject === code) {
          totalSubjects++;
          const match = attendance.find(a =>
            String(a.roll_no || a.roll) === rollNo &&
            a.subject_code === code &&
            a.date === date
          );
          const status = match ? match.status : "Absent";
          if (status.toLowerCase() === "present") presentCount++;
          row += `<td>${status}</td>`;
        }
      });

      const percent = totalSubjects > 0 ? (presentCount / totalSubjects) * 100 : 0;
      row += `<td>${presentCount}</td><td>${percent.toFixed(2)}%</td></tr>`;
      tbody.innerHTML += row;
    });

    table.appendChild(tbody);
    reportTableContainer.innerHTML = "";
    reportTableContainer.appendChild(table);
  } catch (err) {
    console.error("Error loading report", err);
    reportTableContainer.innerHTML = `<p>Error generating report.</p>`;
  }
}
