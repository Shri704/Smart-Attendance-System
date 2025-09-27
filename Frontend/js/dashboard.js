document.addEventListener('DOMContentLoaded', () => {
  // Auto-refresh if attendance was updated
  if (localStorage.getItem("attendance_updated") === "true") {
    loadAttendanceRecords();
    localStorage.removeItem("attendance_updated");
  }

  loadAttendanceRecords(); // initial load

  const reportSemester = document.getElementById('reportSemester');
  const reportSubject = document.getElementById('reportSubject');

  if (reportSemester && reportSubject) {
    reportSemester.addEventListener('change', () => {
      const semester = reportSemester.value;
      const branch = document.getElementById('reportBranch')?.value;

      if (!semester) {
        reportSubject.innerHTML = '<option value="">Select semester first</option>';
        reportSubject.disabled = true;
        return;
      }

      reportSubject.innerHTML = '<option value="">Loading...</option>';
      reportSubject.disabled = true;

      const url = branch
        ? `http://127.0.0.1:8080/subjects/getbysemesterandbranch/${semester}/${branch}`
        : `http://127.0.0.1:8080/subjects/getbysemester/${semester}`;

      fetch(url)
        .then(res => res.json())
        .then(subjects => {
          if (Array.isArray(subjects) && subjects.length > 0) {
            reportSubject.innerHTML = '<option value="">All Subjects</option>';
            subjects.forEach(subject => {
              const opt = document.createElement('option');
              opt.value = subject.code;
              opt.textContent = `${subject.code} - ${subject.name}`;
              reportSubject.appendChild(opt);
            });
          } else {
            reportSubject.innerHTML = '<option value="">No subjects found</option>';
          }
          reportSubject.disabled = false;
        })
        .catch(() => {
          reportSubject.innerHTML = '<option value="">Error loading subjects</option>';
          reportSubject.disabled = true;
        });
    });
  }

  const semesterSelect = document.getElementById('semesterSelect');
  const branchSelect = document.getElementById('branchSelect');
  const subjectSelect = document.getElementById('subjectSelect');

  if (semesterSelect && subjectSelect && branchSelect) {
    semesterSelect.addEventListener('change', loadSubjectsBySemesterAndBranch);
    branchSelect.addEventListener('change', loadSubjectsBySemesterAndBranch);
  }

  // Delegated delete clicks — robust to inner icon/spans
  const tbody = document.getElementById('bulkAttendanceBody');
  if (tbody) {
    tbody.addEventListener('click', (event) => {
      const btn = event.target.closest('button.btn-delete');
      if (!btn || !tbody.contains(btn)) return;

      const id = btn.getAttribute('data-id');
      if (!id) return;

      if (isLikelyObjectId(id)) {
        // delete a single attendance record
        deleteAttendance(id, btn);
      } else {
        // delete all records for a roll number
        deleteStudentRecords(id, btn);
      }
    });
  }
});

// Detect MongoDB-like ObjectId (single-record delete)
function isLikelyObjectId(id) {
  return /^[a-fA-F0-9]{24}$/.test(String(id).trim());
}

function loadSubjectsBySemesterAndBranch() {
  const semester = document.getElementById('semesterSelect').value;
  const branch = document.getElementById('branchSelect').value;
  const subjectSelect = document.getElementById('subjectSelect');

  subjectSelect.innerHTML = '<option value="">Loading...</option>';
  subjectSelect.disabled = true;

  if (!semester || !branch) {
    subjectSelect.innerHTML = '<option value="">Select Semester and Branch</option>';
    return;
  }

  fetch(`http://127.0.0.1:8080/subjects/getbysemesterandbranch/${semester}/${branch}`)
    .then(res => res.json())
    .then(subjects => {
      if (Array.isArray(subjects) && subjects.length > 0) {
        subjectSelect.innerHTML = '<option value="">Select Subject *</option>';
        subjects.forEach(subject => {
          const opt = document.createElement('option');
          opt.value = subject.code;
          opt.textContent = `${subject.code} - ${subject.name}`;
          subjectSelect.appendChild(opt);
        });
      } else {
        subjectSelect.innerHTML = '<option value="">No subjects found</option>';
      }
      subjectSelect.disabled = false;
    })
    .catch(() => {
      subjectSelect.innerHTML = '<option value="">Error loading subjects</option>';
      subjectSelect.disabled = true;
    });
}

function loadAttendanceRecords() {
  fetch('http://127.0.0.1:8080/mark/getall')
    .then(res => res.json())
    .then(records => {
      const tbody = document.getElementById('bulkAttendanceBody');
      const headerRow = document.getElementById('bulkAttendanceHeader');
      if (!tbody || !headerRow) return;

      tbody.innerHTML = '';

      const groupedByStudent = {};

      records.forEach(record => {
        const roll = record.roll_no || record.roll || '';
        const name = record.name || '';
        const branch = record.branch || '';
        const subjectCode = record.subject_code || record.subject || '';
        const status = (record.status || '').toLowerCase();

        if (!groupedByStudent[roll]) {
          groupedByStudent[roll] = {
            name,
            branch,
            subjects: {}
          };
        }

        groupedByStudent[roll].subjects[subjectCode] = status === 'present' ? 'Present' : 'Absent';
      });

      // Collect subject columns
      const allSubjects = new Set();
      Object.values(groupedByStudent).forEach(student =>
        Object.keys(student.subjects).forEach(sub => allSubjects.add(sub))
      );
      const sortedSubjects = Array.from(allSubjects).sort();

      // Header
      headerRow.innerHTML = `
        <th>Roll No</th>
        <th>Name</th>
        <th>Branch</th>
        ${sortedSubjects.map(sub => `<th>${sub}</th>`).join('')}
        <th>Action</th>
      `;

      // Rows
      Object.entries(groupedByStudent).forEach(([roll, info]) => {
        const tr = document.createElement('tr');
        const subjectCells = sortedSubjects
          .map(subject => `<td>${info.subjects[subject] || 'Absent'}</td>`)
          .join('');
        // NOTE: This deletes ALL records for the roll. For per-subject deletes, use the "Load Students" view.
        const deleteBtn = `<button class="btn btn-danger btn-sm btn-delete" data-id="${roll}">Delete</button>`;

        tr.innerHTML = `
          <td>${roll}</td>
          <td>${info.name}</td>
          <td>${info.branch}</td>
          ${subjectCells}
          <td>${deleteBtn}</td>
        `;
        tbody.appendChild(tr);
      });
    })
    .catch(() => {
      const tbody = document.getElementById('bulkAttendanceBody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="100%" class="text-center text-danger">
              Failed to load attendance records.
            </td>
          </tr>`;
      }
    });
}

function loadStudentsForSubject() {
  const semester = document.getElementById('semesterSelect').value;
  const branch = document.getElementById('branchSelect').value;
  const subjectCode = document.getElementById('subjectSelect').value;
  const date = document.getElementById('dateFilter').value;

  if (!semester || !branch || !subjectCode || !date) {
    alert('Please select all filters: semester, branch, subject, and date.');
    return;
  }

  fetch(`http://localhost:8080/students/getall`)
    .then(res => res.json())
    .then(students => {
      // Filter students by semester and branch
      students = students.filter(s =>
        parseInt(s.semester) === parseInt(semester) &&
        String(s.branch).toUpperCase() === String(branch).toUpperCase()
      );

      // Get attendance records for this date+semester+subject
      fetch(`http://localhost:8080/mark/get?date=${date}&semester=${semester}&subject=${subjectCode}`)
        .then(res => res.json())
        .then(attendanceRecords => {
          const tbody = document.getElementById('bulkAttendanceBody');
          const headerRow = document.getElementById('bulkAttendanceHeader');

          tbody.innerHTML = '';
          headerRow.innerHTML = `
            <th>Roll No</th>
            <th>Name</th>
            <th>Branch</th>
            <th>Semester</th>
            <th>Subject Code</th>
            <th>Status</th>
            <th>Action</th>
          `;

          students.forEach(student => {
            const roll = String(student.roll || student.roll_no || '').trim();
            const matched = attendanceRecords.find(record =>
              String(record.roll || record.roll_no).trim() === roll &&
              record.subject_code === subjectCode
            );

            const status = matched && matched.status?.toLowerCase() === 'present' ? 'Present' : 'Absent';
            const recordId = matched?._id || '';
            // This button deletes a SINGLE record for this (date, subject, roll)
            const deleteBtn = matched
              ? `<button class="btn btn-danger btn-sm btn-delete" data-id="${recordId}">Delete</button>`
              : '';

            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td>${roll}</td>
              <td>${student.name || ''}</td>
              <td>${student.branch}</td>
              <td>${student.semester}</td>
              <td>${subjectCode}</td>
              <td>${status}</td>
              <td>${deleteBtn}</td>
            `;
            tbody.appendChild(tr);
          });
        })
        .catch(err => {
          console.error('❌ Error loading attendance:', err);
          alert('Failed to load attendance records.');
        });
    })
    .catch(err => {
      console.error('❌ Error loading students:', err);
      alert('Failed to load student list.');
    });
}

// Helper to safely parse JSON
async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return {}; // fallback if not JSON
  }
}

// Delete a single record by ObjectId
async function deleteAttendance(recordId, btn) {
  if (!confirm('Are you sure you want to delete this attendance record?')) {
    return;
  }

  try {
    const res = await fetch(`http://127.0.0.1:8080/record/delete/${recordId}`, {
      method: "DELETE"
    });

    const data = await safeJson(res);

    if (res.ok) {
      const row = btn?.closest('tr');
      if (row) row.remove();
      alert(data.message || '✅ Record deleted successfully.');
    } else {
      alert(data.error || '❌ Failed to delete record.');
    }
  } catch (err) {
    console.error('Error deleting record:', err);
    alert('🚨 Server error while deleting record. Check backend logs.');
  }
}


// Delete all records for a Roll No
async function deleteStudentRecords(rollNo) {
  if (!confirm(`Are you sure you want to delete ALL records for Roll No: ${rollNo}?`)) {
    return;
  }

  const res = await fetch(`http://127.0.0.1:8080/mark/delete_by_roll/${rollNo}`, {
    method: "DELETE"
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (res.ok) {
    alert(data.message || `✅ All records for Roll No ${rollNo} deleted.`);
    loadStudentRecords();
  } else {
    alert(data.error || "❌ Failed to delete records");
  }
}



function submitBulkAttendance() {
  const rows = document.querySelectorAll('#bulkAttendanceBody tr');
  const semester = document.getElementById('semesterSelect')?.value;
  const subject = document.getElementById('subjectSelect')?.value;
  const date = document.getElementById('dateFilter')?.value;
  const branch = document.getElementById('branchSelect')?.value;

  if (!semester || !subject || !date || !branch) {
    alert('Fill semester, subject, date and branch.');
    return;
  }

  const attendanceList = Array.from(rows).map(row => {
    const cells = row.querySelectorAll('td');
    return {
      roll_no: cells[0]?.textContent.trim(),
      name: cells[1]?.textContent.trim(),
      branch: cells[2]?.textContent.trim(),
      semester: cells[3]?.textContent.trim(),
      subject_code: subject,
      date: date,
      status: cells[5]?.textContent.trim().toLowerCase()
    };
  });

  fetch('http://127.0.0.1:8080/mark/bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attendance: attendanceList })
  })
  .then(res => {
    if (res.ok) {
      alert('✅ Attendance saved.');
      loadStudentsForSubject();  // Reload after save
    } else {
      alert('❌ Failed to save.');
    }
  })
  .catch(() => {
    alert('❌ Error submitting.');
  });
}

function generateReport() {
  const semester = document.getElementById('reportSemester').value;
  const subject = document.getElementById('reportSubject').value;
  const reportType = document.getElementById('reportType').value.toLowerCase();
  const startDate = document.getElementById('startDate').value;
  const endDate = document.getElementById('endDate').value;
  const includePresent = document.getElementById('includePresent').checked;
  const includeAbsent = document.getElementById('includeAbsent').checked;

  if (!semester || !startDate || !endDate || !reportType) {
    alert('Please fill all required fields.');
    return;
  }

  const payload = {
    semester,
    subject,
    report_type: reportType,
    start_date: startDate,
    end_date: endDate,
    include_present: includePresent,
    include_absent: includeAbsent
  };

  fetch('http://127.0.0.1:8080/mark/generate_filtered_report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(res => {
    if (!res.ok) {
      return res.text().then(text => {
        console.error('Backend error:', text);
        throw new Error('Failed to generate report.');
      });
    }
    return res.blob();
  })
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${reportType}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  })
  .catch(err => {
    console.error(err);
    alert('Failed to generate report.');
  });
}

// secondary "semester -> subjects" loader (kept as-is; different scope than the one inside DOMContentLoaded)
const semesterSelect2 = document.getElementById('semesterSelect');
const subjectSelect2 = document.getElementById('subjectSelect');

if (semesterSelect2 && subjectSelect2) {
  semesterSelect2.addEventListener('change', () => {
    const semester = semesterSelect2.value;
    subjectSelect2.innerHTML = '<option value="">Loading...</option>';
    subjectSelect2.disabled = true;

    if (!semester) return;

    fetch(`http://127.0.0.1:8080/subjects/getbysemester/${semester}`)
      .then(res => res.json())
      .then(subjects => {
        if (Array.isArray(subjects) && subjects.length > 0) {
          subjectSelect2.innerHTML = '<option value="">Select Subject *</option>';
          subjects.forEach(subject => {
            const opt = document.createElement('option');
            opt.value = subject.code;
            opt.textContent = `${subject.code} - ${subject.name}`;
            subjectSelect2.appendChild(opt);
          });
        } else {
          subjectSelect2.innerHTML = '<option value="">No subjects found</option>';
        }
        subjectSelect2.disabled = false;
      })
      .catch(() => {
        subjectSelect2.innerHTML = '<option value="">Error loading subjects</option>';
        subjectSelect2.disabled = true;
      });
  });
}

function submitAttendance() {
  const rollNo = document.getElementById('rollNo').value.trim();
  const date = document.getElementById('attendanceDate').value;
  const semester = document.getElementById('attendanceSemester').value;
  const branch = document.getElementById('attendanceBranch').value.trim();
  const subject = document.getElementById('attendanceSubject').value;
  const status = document.getElementById('attendanceStatus').value;

  if (!rollNo || !date || !semester || !branch || !subject || !status) {
    alert('Please fill in all required fields.');
    return;
  }

  const attendanceData = {
    roll_no: rollNo,
    date,
    semester,
    branch,
    subject_code: subject,
    status
  };

  const saveBtn = document.querySelector('#attendanceModal .btn-primary');
  saveBtn.disabled = true;
  saveBtn.innerText = 'Saving...';

  fetch('http://127.0.0.1:8080/attendance/mark', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(attendanceData)
  })
  .then(response => {
    if (!response.ok) throw new Error('Failed to save attendance');
    return response.json();
  })
  .then(() => {
    alert('Attendance saved successfully!');
    document.getElementById('attendanceForm').reset();
    const modal = bootstrap.Modal.getInstance(document.getElementById('attendanceModal'));
    if (modal) modal.hide();
    loadStudentsForSubject();
  })
  .catch(error => {
    console.error('Error saving attendance:', error);
    alert('Failed to save attendance. Please try again.');
  })
  .finally(() => {
    saveBtn.disabled = false;
    saveBtn.innerText = 'Save Changes';
  });
}

function loadSubjectsForAttendance() {
  const semester = document.getElementById('attendanceSemester').value;
  const subjectDropdown = document.getElementById('attendanceSubject');

  subjectDropdown.innerHTML = '<option value="">Loading...</option>';
  subjectDropdown.disabled = true;

  if (!semester) {
    subjectDropdown.innerHTML = '<option value="">Select Semester First</option>';
    return;
  }

  fetch(`http://127.0.0.1:8080/subjects/getbysemester/${semester}`)
    .then(res => res.json())
    .then(subjects => {
      if (Array.isArray(subjects) && subjects.length > 0) {
        subjectDropdown.innerHTML = '<option value="">Select Subject</option>';
        subjects.forEach(subject => {
          const option = document.createElement('option');
          option.value = subject.code;
          option.textContent = `${subject.code} - ${subject.name}`;
          subjectDropdown.appendChild(option);
        });
      } else {
        subjectDropdown.innerHTML = '<option value="">No subjects found</option>';
      }
      subjectDropdown.disabled = false;
    })
    .catch(() => {
      subjectDropdown.innerHTML = '<option value="">Error loading subjects</option>';
      subjectDropdown.disabled = true;
    });
}

function onclickclear() {
  // Clear dropdowns
  const selects = document.querySelectorAll('select');
  selects.forEach(select => {
    select.selectedIndex = 0;
  });

  // Clear all date inputs
  const dates = document.querySelectorAll('input[type="date"]');
  dates.forEach(dateInput => {
    dateInput.value = '';
  });

  // Optional: Clear table if needed
  const tbody = document.getElementById('bulkAttendanceBody');
  if (tbody) tbody.innerHTML = '';

  // Optional: Reset subject dropdowns if they are dependent
  const subjectSelect = document.getElementById('subjectSelect');
  if (subjectSelect) {
    subjectSelect.innerHTML = '<option value="">Select Subject *</option>';
    subjectSelect.disabled = false;
  }

  const reportSubject = document.getElementById('reportSubject');
  if (reportSubject) {
    reportSubject.innerHTML = '<option value="">Select Subject *</option>';
    reportSubject.disabled = false;
  }
}

function jumpToNextSemester() {
  const semester = parseInt(document.getElementById("semesterSelect").value);
  const branch = document.getElementById("branchSelect").value;

  if (!semester) {
    alert("Please select a semester to promote.");
    return;
  }
  if (!branch) {
    alert("Please select a branch to promote.");
    return;
  }

  if (!confirm(`Promote all students from Semester ${semester} (${branch}) to Semester ${semester + 1}?`)) {
    return;
  }

  let excludeInput = prompt(
    "Enter roll numbers to exclude (comma-separated), or leave blank for none:",
    ""
  );
  let excludeRolls = [];
  if (excludeInput && excludeInput.trim().length > 0) {
    excludeRolls = excludeInput.split(",").map(r => r.trim());
  }

  fetch("http://127.0.0.1:8080/promote-semester", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ semester, branch, excludeRolls })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert("Error: " + data.error);
      } else {
        const studentsUpdated = data.students_updated !== undefined ? data.students_updated : 0;
        const filesRenamed = data.files_renamed !== undefined ? data.files_renamed : 0;

        alert(
          data.message +
            `\n\nDetails:\n- Students updated: ${studentsUpdated}\n- Files renamed: ${filesRenamed}`
        );
      }
    })
    .catch(err => {
      console.error("Error promoting students:", err);
      alert("Error promoting students. Please check console.");
    });
}
