document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('addSubjectForm');

    if (!form) {
        console.error('Form with ID "addSubjectForm" not found.');
        return;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get input values safely
        const codeInput = document.getElementById('subjectCode');
        const nameInput = document.getElementById('subjectName');
        const branchInput = document.getElementById('subjectBranch');  // ✅ corrected ID
        const semesterInput = document.getElementById('subjectSemester');  // ✅ corrected ID

        if (!codeInput || !nameInput || !branchInput || !semesterInput) {
            alert('Form inputs not found. Please check IDs in HTML.');
            return;
        }

        const code = codeInput.value.trim();
        const name = nameInput.value.trim();
        const branch = branchInput.value.trim().toUpperCase();
        const semester = parseInt(semesterInput.value);

        if (!code || !name || !branch || !semester) {
            alert('All fields are required.');
            return;
        }

        const subjectData = {
            code,
            name,
            branch,
            semester
        };

        try {
            const res = await fetch('http://127.0.0.1:8080/api/add-subject', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(subjectData)
            });

            let result;
            try {
                result = await res.json();
            } catch (jsonErr) {
                console.error("Could not parse JSON from server:", jsonErr);
                alert("Server returned an invalid response.");
                return;
            }

            if (res.ok) {
                alert('✅ Subject added successfully!');
                form.reset();
            } else {
                alert(result.error || 'Failed to add subject.');
            }
        } catch (err) {
            console.error("Error sending request:", err);
            alert('❌ Network error while adding subject.');
        }
    });
});
