document.addEventListener('DOMContentLoaded', () => {
    loadSemesters();
    loadBranches();

    const semesterSelect = document.getElementById('semester');
    const branchSelect = document.getElementById('branch');

    if (semesterSelect && branchSelect) {
        semesterSelect.addEventListener('change', loadSubjects);
        branchSelect.addEventListener('change', loadSubjects);
    }
});

function loadSemesters() {
    const semesterSelect = document.getElementById('semester');
    if (!semesterSelect) return;

    semesterSelect.innerHTML = '<option value="">Select Semester</option>';
    for (let i = 1; i <= 8; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Semester ${i}`;
        semesterSelect.appendChild(option);
    }
}

function loadBranches() {
    fetch('http://127.0.0.1:8080/students/getbranches')
        .then(res => {
            if (!res.ok) throw new Error("Failed to fetch branches");
            return res.json();
        })
        .then(branches => {
            const branchSelect = document.getElementById('branch');
            if (!branchSelect) return;

            branchSelect.innerHTML = '<option value="">Select Branch</option>';
            if (Array.isArray(branches) && branches.length > 0) {
                branches.forEach(branch => {
                    const option = document.createElement('option');
                    option.value = branch;
                    option.textContent = branch;
                    branchSelect.appendChild(option);
                });
            }
        })
        .catch(err => {
            console.error('Failed to load branches:', err);
            alert('Error loading branches from server.');
        });
}

function loadSubjects() {
    const semester = document.getElementById('semester').value;
    const branch = document.getElementById('branch').value;
    const subjectSelect = document.getElementById('subject');

    if (!subjectSelect) return;

    subjectSelect.innerHTML = '<option value="">Loading subjects...</option>';
    subjectSelect.disabled = true;

    if (!semester || !branch) {
        subjectSelect.innerHTML = '<option value="">Select Semester & Branch</option>';
        subjectSelect.disabled = false;
        return;
    }

    fetch(`http://127.0.0.1:8080/subjects/getbysemesterandbranch/${semester}/${branch}`)
        .then(res => {
            if (!res.ok) throw new Error("Failed to fetch subjects");
            return res.json();
        })
        .then(subjects => {
            subjectSelect.innerHTML = '';
            if (Array.isArray(subjects) && subjects.length > 0) {
                const allOption = document.createElement('option');
                allOption.value = '';
                allOption.textContent = 'All Subjects';
                subjectSelect.appendChild(allOption);

                subjects.forEach(subject => {
                    const option = document.createElement('option');
                    option.value = subject.code;
                    option.textContent = `${subject.code} - ${subject.name}`;
                    subjectSelect.appendChild(option);
                });
            } else {
                subjectSelect.innerHTML = '<option value="">No subjects found</option>';
            }
            subjectSelect.disabled = false;
        })
        .catch(err => {
            console.error('Error loading subjects:', err);
            subjectSelect.innerHTML = '<option value="">Error loading subjects</option>';
            subjectSelect.disabled = false;
        });
}

function clearForm() {
    const form = document.getElementById('reportForm');
    if (form) form.reset();
}

function generateReport() {
    const semester = document.getElementById('semester')?.value;
    const branch = document.getElementById('branch')?.value;
    const subject = document.getElementById('subject')?.value || ''; // Ensure it's not undefined
    const reportType = document.getElementById('reportType')?.value?.toLowerCase();
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    const includePresent = document.getElementById('includePresent')?.checked || false;
    const includeAbsent = document.getElementById('includeAbsent')?.checked || false;

    if (!semester || !branch || !startDate || !endDate || !reportType) {
        alert('Please fill all required fields.');
        return;
    }

    const payload = {
        semester,
        branch,
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
                    throw new Error(text || 'Failed to generate report.');
                });
            }
            return res.blob();
        })
        .then(blob => {
            if (!blob || blob.size === 0) throw new Error('Empty file received.');

            const now = new Date();
            const dateStr = now.toISOString().slice(0, 10);
            const filename = `attendance_${reportType}_${dateStr}.xlsx`;

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        })
        .catch(err => {
            console.error('Report generation failed:', err);
            alert(`Failed to generate report: ${err.message}`);
        });
}
