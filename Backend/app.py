from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import cv2
import numpy as np
import datetime
import os
import base64
import re
import pandas as pd
from utils.face_recognition_utils import load_known_faces, process_frame, draw_face_boxes
from pymongo import MongoClient
from bson.objectid import ObjectId
import logging
from io import BytesIO
# import sqlite3
# from collections import defaultdict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Directories
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KNOWN_FACES_DIR = os.path.join(os.path.dirname(BASE_DIR), "data", "known_faces")
ATTENDANCE_DIR = os.path.join(os.path.dirname(BASE_DIR), "data", "attendance_records")

# Ensure directories exist
for directory in [KNOWN_FACES_DIR, ATTENDANCE_DIR]:
    if not os.path.exists(directory):
        os.makedirs(directory)
        logger.info(f"Created directory: {directory}")

from pymongo import MongoClient
from urllib.parse import quote_plus
import logging

logger = logging.getLogger(__name__)

username = "shrinidhish909"
password = "Narasimha@#5570"  # your actual password

encoded_password = quote_plus(password)  # encodes @ and #

uri = f"mongodb+srv://{username}:{encoded_password}@cluster0.ibftnwf.mongodb.net/?retryWrites=true&w=majority"

try:
    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    client.server_info()

    db = client['attendance_db']
    students_collection = db['students']
    attendance_collection = db['attendance']
    subjects_collection = db['subjects']

    logger.info("✅ Successfully connected to Atlas MongoDB")
except Exception as e:
    logger.error(f"❌ Failed to connect to MongoDB: {e}")
    raise

@app.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        if not data:
            logger.error("No data provided in request")
            return jsonify({'error': 'No data provided'}), 400

        roll_no = data.get('rollNo')
        name = data.get('name')
        branch = data.get('branch')
        semester = data.get('semester')
        face_image = data.get('faceImage')

        # Validate required fields
        if not all([roll_no, name, branch, semester, face_image]):
            missing_fields = []
            if not roll_no: missing_fields.append('Roll Number')
            if not name: missing_fields.append('Name')
            if not branch: missing_fields.append('Branch')
            if not semester: missing_fields.append('Semester')
            if not face_image: missing_fields.append('Face Image')
            logger.error(f"Missing required fields: {', '.join(missing_fields)}")
            return jsonify({'error': f'Missing required fields: {", ".join(missing_fields)}'}), 400

        # Ensure semester is an int
        try:
            semester = int(semester)
        except ValueError:
            logger.error("Semester must be a number")
            return jsonify({'error': 'Semester must be a number'}), 400

        # Check if student already exists
        existing_student = students_collection.find_one({
            'roll_no': roll_no,
            'branch': branch,
            'semester': semester
        })

        if existing_student:
            logger.error(f"Student with Roll No: {roll_no}, Branch: {branch}, Semester: {semester} already exists")
            return jsonify({'error': f'Student with Roll No {roll_no} already exists'}), 400

        # Save student data to MongoDB
        student = {
            'roll_no': roll_no,
            'name': name,
            'branch': branch,
            'semester': semester,
            'created_at': datetime.datetime.now()
        }

        result = students_collection.insert_one(student)
        if not result.inserted_id:
            logger.error("Failed to save student data to MongoDB")
            return jsonify({'error': 'Failed to save student data'}), 500

        # Decode and save face image
        try:
            image_data = re.sub('^data:image/.+;base64,', '', face_image)
            image_bytes = base64.b64decode(image_data)

            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if image is None:
                students_collection.delete_one({'_id': result.inserted_id})
                logger.error("Invalid image data received")
                return jsonify({"error": "Invalid image data"}), 400

            # Corrected filename format: roll_sem_name_branch
            filename = f"{roll_no}_{semester}_{name.replace(' ', '')}_{branch.replace(' ', '')}.jpg"
            file_path = os.path.join(KNOWN_FACES_DIR, filename)
            
            # Ensure directory exists
            os.makedirs(KNOWN_FACES_DIR, exist_ok=True)

            success = cv2.imwrite(file_path, image)
            if not success:
                students_collection.delete_one({'_id': result.inserted_id})
                logger.error(f"Failed to save face image to {file_path}")
                return jsonify({"error": "Failed to save face image"}), 500

            # Update image path in DB
            students_collection.update_one(
                {'_id': result.inserted_id},
                {'$set': {'face_image_path': file_path}}
            )

            logger.info(f"Successfully registered student: {roll_no}")
            return jsonify({
                "message": "Student registered successfully",
                "student": {
                    "roll_no": roll_no,
                    "name": name,
                    "branch": branch,
                    "semester": semester
                }
            }), 200

        except Exception as e:
            students_collection.delete_one({'_id': result.inserted_id})
            logger.error(f"Failed to process image: {str(e)}")
            return jsonify({"error": f"Failed to process image: {str(e)}"}), 500

    except Exception as e:
        logger.error(f"Registration failed: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/start-attendance', methods=['POST'])
def start_attendance():
    try:
        data = request.json
        subject_code = data.get('subject_code')
        semester = data.get('semester')
        branch = data.get('branch')
        timing = data.get('timing')

        if not subject_code or not semester or not branch or not timing:
            return jsonify({"error": "Subject code, semester, branch, and timing are required"}), 400

        client = MongoClient('mongodb://127.0.0.1:27017/')
        db = client['attendance_db']
        subjects_collection = db['subjects']
        students_collection = db['students']
        attendance_collection = db['attendance']

        subject = subjects_collection.find_one({
            'code': subject_code,
            'semester': int(semester),
            'branch': branch.upper()
        })

        if not subject:
            client.close()
            return jsonify({"error": "Invalid subject code, semester, or branch"}), 400

        current_date = datetime.datetime.now().strftime('%Y-%m-%d')
        current_time = datetime.datetime.now().strftime('%H:%M:%S')

        existing_attendance = attendance_collection.find_one({
            'subject_code': subject_code,
            'date': current_date,
            'semester': int(semester),
            'branch': branch.upper()
        })

        if existing_attendance:
            client.close()
            return jsonify({"error": "Attendance already taken today for this subject"}), 400

        logger.info(f"Starting attendance for {subject['name']} ({subject_code}) - Sem {semester}, Branch {branch}")

        # Load faces only for the selected semester & branch
        known_face_encodings, known_face_names = load_known_faces(
            KNOWN_FACES_DIR, semester=int(semester), branch=branch.upper()
        )

        if not known_face_encodings:
            client.close()
            return jsonify({"error": "No registered faces found for this semester/branch"}), 400

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            client.close()
            return jsonify({"error": "Could not open camera"}), 500

        attendance_records = []
        marked_attendance = set()

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            face_locations, face_names = process_frame(frame, known_face_encodings, known_face_names)

            for name in face_names:
                if name != "Unknown" and name not in marked_attendance:
                    parts = name.split('_')

                    if len(parts) >= 4:
                        roll_no = parts[0]
                        student_sem = int(parts[1])
                        student_branch = parts[-1]   # last part is branch
                        student_name = "_".join(parts[2:-1])  # join middle as name
                    else:
                        roll_no = parts[0]
                        student_sem = int(semester)
                        student_name = "Unknown"
                        student_branch = branch.upper()

                    if student_sem != int(semester) or student_branch.upper() != branch.upper():
                        continue

                    marked_attendance.add(name)

                    attendance_collection.update_one(
                        {
                            'roll': roll_no,
                            'subject_code': subject_code,
                            'date': current_date
                        },
                        {
                            '$set': {
                                'name': student_name,
                                'branch': student_branch,
                                'semester': student_sem,
                                'subject_code': subject_code,
                                'subject': subject['name'],
                                'time': current_time,
                                'timing': timing,
                                'status': 'present',
                                'date': current_date
                            }
                        },
                        upsert=True
                    )

                    attendance_records.append({
                        'Roll No': roll_no,
                        'Name': student_name,
                        'Branch': student_branch,
                        'Subject': subject['name'],
                        'Subject Code': subject_code,
                        'Semester': student_sem,
                        'Date': current_date,
                        'Time': current_time,
                        'Status': 'Present'
                    })

            # Break loop when all known students are marked
            if len(marked_attendance) >= len(known_face_names):
                break

        # ✅ Always release resources
        cap.release()
        cv2.destroyAllWindows()

        # Absentees
        all_students = list(students_collection.find({
            'semester': int(semester),
            'branch': branch.upper()
        }))

        present_rolls = {record['Roll No'] for record in attendance_records}
        all_records = []

        for student in all_students:
            is_present = student['roll'] in present_rolls
            all_records.append({
                'Roll No': student['roll'],
                'Name': student['name'],
                'Branch': student['branch'],
                'Subject': subject['name'],
                'Subject Code': subject_code,
                'Semester': semester,
                'Date': current_date,
                'Time': current_time if is_present else '-',
                'Status': 'Present' if is_present else 'Absent'
            })

        df = pd.DataFrame(all_records)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"attendance_{subject_code}{branch}sem{semester}{timestamp}.xlsx"
        filepath = os.path.join(ATTENDANCE_DIR, filename)
        df.to_excel(filepath, index=False)

        client.close()

        return jsonify({
            "message": "Attendance completed successfully",
            "subject": subject['name'],
            "subject_code": subject_code,
            "semester": semester,
            "branch": branch,
            "students_present": list(present_rolls),
            "total_count": len(marked_attendance),
            "excel_file": filename
        })

    except Exception as e:
        # ✅ Ensure resources are cleaned even if error occurs
        try:
            cap.release()
            cv2.destroyAllWindows()
        except:
            pass
        try:
            client.close()
        except:
            pass

        logger.error(f"Error in attendance: {str(e)}")
        return jsonify({"error": str(e)}), 500



@app.route('/status')
def status():
    try:
        # Check MongoDB connection
        client.server_info()
        return jsonify({
            "status": "ok",
            "message": "Server is running",
            "mongodb": "connected"
        }), 200
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        return jsonify({
            "status": "error",
            "message": "Server is running but MongoDB is not connected",
            "error": str(e)
        }), 500

@app.route('/test-camera')
def test_camera():
    """Test if camera is working"""
    try:
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            return jsonify({"error": "Could not open camera"}), 500
            
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            return jsonify({"error": "Could not read frame from camera"}), 500
            
        return jsonify({"message": "Camera is working properly"})
    except Exception as e:
        return jsonify({"error": f"Camera test failed: {str(e)}"}), 500

@app.route('/students/getall', methods=['GET'])
def get_all_students():
    """Get all registered students"""
    try:
        students = list(students_collection.find())
        
        # Convert ObjectId to string for JSON serialization
        for student in students:
            student['_id'] = str(student['_id'])
        
        logger.info(f"Found {len(students)} total students")
        return jsonify(students)
    except Exception as e:
        logger.error(f"Error fetching students: {e}")
        return jsonify({"error": "Failed to fetch students"}), 500

@app.route('/subjects/getall', methods=['GET'])
def get_all_subjects():
    """Get all subjects"""
    try:
        subjects_collection = db['subjects']
        subjects = list(subjects_collection.find())
        
        # Convert ObjectId to string for JSON serialization
        for subject in subjects:
            subject['_id'] = str(subject['_id'])
        
        logger.info(f"Found {len(subjects)} total subjects")
        return jsonify(subjects)
    except Exception as e:
        logger.error(f"Error getting all subjects: {e}")
        return jsonify({'error': str(e)}), 500


# ✅ Get subjects by semester
@app.route("/subjects/getbysemester/<semester>", methods=["GET"])
def get_subjects_by_semester(semester):
    try:
        semester = int(semester)

        client = MongoClient('mongodb://127.0.0.1:27017/')
        db = client['attendance_db']
        subjects_collection = db['subjects']

        subjects = list(subjects_collection.find(
            {"semester": semester},
            {"_id": 1, "code": 1, "name": 1, "branch": 1, "semester": 1}
        ).sort("code", 1))

        for subject in subjects:
            subject["_id"] = str(subject["_id"])  # Convert ObjectId to string

        logger.info(f"Fetched {len(subjects)} subjects for semester {semester}")
        client.close()
        return jsonify(subjects), 200

    except ValueError:
        logger.error("Invalid semester format")
        return jsonify({"error": "Invalid semester format"}), 400

    except Exception as e:
        try:
            client.close()
        except:
            pass
        logger.error(f"Error fetching subjects by semester: {e}")
        return jsonify({"error": str(e)}), 500


# ✅ Get subjects by semester and branch
@app.route("/subjects/getbysemesterandbranch/<semester>/<branch>", methods=["GET"])
def get_subjects_by_semester_and_branch(semester, branch):
    try:
        semester = int(semester)
        branch = branch.upper().strip()

        subjects = list(subjects_collection.find(
            {"semester": semester, "branch": branch},
            {"_id": 1, "code": 1, "name": 1, "branch": 1, "semester": 1}
        ).sort("code", 1))

        for subject in subjects:
            subject["_id"] = str(subject["_id"])

        logger.info(f"Fetched {len(subjects)} subjects for semester {semester} and branch {branch}")
        return jsonify(subjects), 200
    except ValueError:
        logger.error("Invalid semester format")
        return jsonify({"error": "Invalid semester format"}), 400
    except Exception as e:
        logger.error(f"Error fetching subjects by semester and branch: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/mark/get', methods=['GET'])
def get_attendance():
    try:
        date = request.args.get('date')
        semester = request.args.get('semester')

        if not date:
            return jsonify({'error': 'Date parameter is required'}), 400

        query = {'date': date}
        if semester:
            query['semester'] = int(semester)

        records = list(attendance_collection.find(query))

        for rec in records:
            rec['_id'] = str(rec['_id'])
            # ensure roll_no is present
            if 'roll_no' not in rec and 'roll' in rec:
                rec['roll_no'] = rec['roll']
        return jsonify(records), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/mark/getrange', methods=['GET'])
def get_attendance_range():
    try:
        start_date = request.args.get('start')
        end_date = request.args.get('end')
        semester = request.args.get('semester')
        
        if not start_date or not end_date:
            return jsonify({'error': 'Start and end dates are required'}), 400
            
        collection = db['attendance']
        
        query = {
            'date': {
                '$gte': start_date,
                '$lte': end_date
            }
        }
        
        if semester:
            query['semester'] = int(semester)
            
        attendance_records = list(collection.find(query))
        
        # Convert ObjectId to string for JSON serialization
        for record in attendance_records:
            record['_id'] = str(record['_id'])
            
        logger.info(f"Found {len(attendance_records)} attendance records between {start_date} and {end_date} for semester {semester}")
        return jsonify(attendance_records)
        
    except Exception as e:
        logger.error(f"Error fetching attendance range: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/mark/bulkupdate', methods=['POST'])
def bulk_update_attendance():
    try:
        attendance_data = request.json
        
        if not attendance_data:
            return jsonify({'error': 'No attendance data provided'}), 400
            
        collection = db['attendance']
        
        # Get subject details for each record
        subjects_collection = db['subjects']
        for record in attendance_data:
            subject = subjects_collection.find_one({'code': record['subject_code']})
            if subject:
                record['subject_name'] = subject['name']
                record['semester'] = subject['semester']
        
        # Insert all records
        result = collection.insert_many(attendance_data)
        
        logger.info(f"Successfully inserted {len(result.inserted_ids)} attendance records")
        return jsonify({'message': 'Attendance records updated successfully'})
        
    except Exception as e:
        logger.error(f"Error updating attendance: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/students/getbysemester/<semester>', methods=['GET'])
def get_students_by_semester(semester):
    try:
        collection = db['students']
        
        students = list(collection.find({'semester': int(semester)}))
        
        # Convert ObjectId to string for JSON serialization
        for student in students:
            student['_id'] = str(student['_id'])
            
        logger.info(f"Found {len(students)} students for semester {semester}")
        return jsonify(students)
        
    except Exception as e:
        logger.error(f"Error fetching students: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/students/getbysemesterandsubject/<semester>/<subject_code>', methods=['GET'])
def get_students_by_semester_and_subject(semester, subject_code):
    try:
        collection = db['students']
        # Try to filter by both semester and subject (if students have a 'subjects' field)
        students = list(collection.find({
            'semester': int(semester),
            '$or': [
                {'subjects': {'$in': [subject_code]}},
                {'subjects': {'$exists': False}}  # fallback: include if no subjects field
            ]
        }))
        for student in students:
            student['_id'] = str(student['_id'])
        return jsonify(students)
    except Exception as e:
        logger.error(f"Error fetching students by semester and subject: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/mark/getall', methods=['GET'])
def get_all_attendance():
    try:
        collection = db['attendance']
        records = list(collection.find())
        for record in records:
            record['_id'] = str(record['_id'])
        return jsonify(records)
    except Exception as e:
        logger.error(f"Error fetching all attendance: {str(e)}")
        return jsonify({'error': str(e)}), 500
    
logger = logging.getLogger(__name__)

@app.route('/mark/generate_filtered_report', methods=['POST'])
def generate_filtered_report():
    try:
        data = request.json
        semester = int(data.get('semester'))
        subject_code = data.get('subject')  # Optional
        branch = data.get('branch')         # <-- NEW
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        report_type = data.get('report_type', '').lower()

        if not start_date or not end_date:
            return jsonify({'error': 'Start and end date are required'}), 400

        # Query students by semester and branch
        student_query = {'semester': semester}
        if branch:
            student_query['branch'] = branch

        students = list(db['students'].find(student_query))
        for s in students:
            s['_id'] = str(s['_id'])

        if not students:
            return jsonify({'error': 'No students found'}), 404

        # Map roll numbers
        student_map = {}
        for s in students:
            roll = str(s.get('roll_no') or s.get('roll', '')).strip()
            if roll:
                student_map[roll] = s

        # Attendance query
        attendance_query = {
            'semester': semester,
            'date': {'$gte': start_date, '$lte': end_date}
        }
        if subject_code:
            attendance_query['subject_code'] = subject_code
        if branch:
            attendance_query['branch'] = branch

        attendance_records = list(db['attendance'].find(attendance_query))

        # Get all subjects
        subject_codes = [subject_code] if subject_code else list(
            db['subjects'].distinct('code', {'semester': semester})
        )

        output = BytesIO()
        writer = pd.ExcelWriter(output, engine='xlsxwriter')

        # ------------------------------------------
        # DAILY REPORT: Each subject-date as column
        # ------------------------------------------
        if report_type == 'daily':
            # All dates in the range (even if no attendance marked)
            date_range = pd.date_range(start=start_date, end=end_date).strftime('%Y-%m-%d').tolist()

            # Column headers like subject1_2025-07-01, subject2_2025-07-01
            column_headers = []
            for subj in subject_codes:
                for date in date_range:
                    column_headers.append(f'{subj}_{date}')

            # Initialize default rows (Absent)
            sheet_data = []
            for s in students:
                roll = str(s.get('roll_no') or s.get('roll', '')).strip()
                row = {
                    'Roll No': roll,
                    'Name': s.get('name', ''),
                    'Branch': s.get('branch', '')
                }
                for header in column_headers:
                    row[header] = 'Absent'
                sheet_data.append(row)

            # Update "Present" where attendance matched
            for r in attendance_records:
                roll = str(r.get('roll_no') or r.get('roll', '')).strip()
                subj = r.get('subject_code')
                r_date = r.get('date')
                key = f'{subj}_{r_date}'
                if roll and subj in subject_codes and key in column_headers:
                    for row in sheet_data:
                        if row['Roll No'] == roll:
                            row[key] = 'Present'
                            break

            df = pd.DataFrame(sheet_data)
            df.to_excel(writer, sheet_name='Daily Report', index=False)

        # ------------------------------------------
        # SINGLE SUBJECT REPORT
        # ------------------------------------------
        elif subject_code:
            total_classes = len(set(
                r['date'] for r in attendance_records if r.get('subject_code') == subject_code
            ))

            data_rows = []
            for s in students:
                roll = str(s.get('roll_no') or s.get('roll', '')).strip()
                present_count = 0

                for r in attendance_records:
                    rec_roll = str(r.get('roll_no') or r.get('roll', '')).strip()
                    if rec_roll == roll and r.get('subject_code') == subject_code and r.get('status', '').lower() == 'present':
                        present_count += 1

                attendance_percentage = round((present_count / total_classes) * 100, 2) if total_classes > 0 else 0

                data_rows.append({
                    'Subject Code': subject_code,
                    'Roll No': roll,
                    'Name': s.get('name', ''),
                    'Branch': s.get('branch', ''),
                    'Classes Held': total_classes,
                    'Present Count': present_count,
                    'Attendance %': attendance_percentage
                })

            df = pd.DataFrame(data_rows)
            df.to_excel(writer, sheet_name='Subject Report', index=False)

        # ------------------------------------------
        # WEEKLY / MONTHLY REPORT
        # ------------------------------------------
        else:
            subject_class_count = {
                subj: len(set(r['date'] for r in attendance_records if r['subject_code'] == subj))
                for subj in subject_codes
            }

            for s in students:
                for subj in subject_codes:
                    s[f'{subj}_Present'] = 0
                    s[f'{subj}_Status'] = 'Absent'

            for r in attendance_records:
                roll = str(r.get('roll_no') or r.get('roll', '')).strip()
                subj = r.get('subject_code')
                if roll in student_map and subj in subject_codes:
                    if r.get('status', '').lower() == 'present':
                        student_map[roll][f'{subj}_Present'] += 1
                        student_map[roll][f'{subj}_Status'] = 'Present'

            summary_rows = []
            for s in students:
                row = {
                    'Roll No': s.get('roll_no') or s.get('roll') or '',
                    'Name': s.get('name', ''),
                    'Branch': s.get('branch', '')
                }
                for subj in subject_codes:
                    row[f'{subj} Classes Held'] = subject_class_count.get(subj, 0)
                    row[f'{subj} Present'] = s.get(f'{subj}_Present', 0)
                summary_rows.append(row)

            df = pd.DataFrame(summary_rows)
            report_title = 'Monthly Report' if report_type == 'monthly' else 'Weekly Report'
            df.to_excel(writer, sheet_name=report_title, index=False)

            # Add subject summary
            subject_summary = pd.DataFrame([{
                'Subject Code': subj,
                'Total Classes Held': subject_class_count[subj]
            } for subj in subject_codes])
            subject_summary.to_excel(writer, sheet_name='Subject Summary', index=False)

        writer.close()
        output.seek(0)
        filename = f"attendance_report_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(output, download_name=filename, as_attachment=True)

    except Exception as e:
        logger.error(f"Error generating filtered report: {e}")
        return jsonify({'error': str(e)}), 500



# ------------------------------
# Delete single record by ObjectId
# ------------------------------
@app.route("/record/delete/<record_id>", methods=["DELETE", "OPTIONS"])
def delete_record(record_id):
    if request.method == "OPTIONS":
        # Handle CORS preflight
        return jsonify({"message": "Preflight OK"}), 200

    try:
        # Validate ObjectId
        try:
            oid = ObjectId(record_id)
        except Exception:
            return jsonify({"error": "Invalid record id"}), 400

        result = attendance_collection.delete_one({"_id": oid})

        if result.deleted_count == 0:
            return jsonify({"error": "Record not found"}), 404

        return jsonify({"message": "Deleted record successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500 
    
import traceback
@app.route("/mark/delete_by_roll/<roll_no>", methods=["DELETE"])
def delete_attendance_by_roll(roll_no):
    try:
        roll_no_clean = str(roll_no).strip()

        # Delete records where "roll" matches (string or integer)
        deleted_count = attendance_collection.delete_many({
            "$or": [
                {"roll": roll_no_clean},
                {"roll": int(roll_no_clean) if roll_no_clean.isdigit() else None}
            ]
        }).deleted_count

        if deleted_count > 0:
            return jsonify({"message": f"✅ Deleted {deleted_count} record(s) for Roll No: {roll_no}"}), 200
        else:
            return jsonify({"error": f"⚠️ No records found for Roll No: {roll_no}"}), 404

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/attendance/mark', methods=['POST'])
def mark_attendance():
    data = request.get_json()

    # Validate required fields
    required_fields = ['roll_no', 'date', 'semester', 'branch', 'subject_code', 'status']
    if not all(field in data and data[field] for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        attendance_collection.insert_one({
            'roll_no': data['roll_no'],
            'date': data['date'],
            'semester': data['semester'],
            'branch': data['branch'],
            'subject_code': data['subject_code'],
            'status': data['status']
        })
        return jsonify({'message': 'Attendance saved successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@app.route("/api/add-subject", methods=["POST"])
def add_subject():
    data = request.get_json()

    # Safely convert all fields to strings (except semester)
    subject_code = str(data.get("code", "")).strip()
    subject_name = str(data.get("name", "")).strip()
    branch = str(data.get("branch", "")).strip().upper()  # Normalize branch

    semester_raw = data.get("semester", "")

    # Basic validation
    if not subject_code or not subject_name or not branch or semester_raw == "":
        return jsonify({"success": False, "message": "All fields are required"}), 400

    try:
        semester = int(semester_raw)
    except ValueError:
        return jsonify({"success": False, "message": "Semester must be a number"}), 400

    # Optional: Validate semester is in range 1-8
    if semester < 1 or semester > 8:
        return jsonify({"success": False, "message": "Semester must be between 1 and 8"}), 400

    # Prevent duplicate subjects with same code
    existing = subjects_collection.find_one({"code": subject_code})
    if existing:
        return jsonify({"success": False, "message": "Subject already exists"}), 409

    # Subject structure to insert
    subject = {
        "code": subject_code,
        "name": subject_name,
        "branch": branch,
        "semester": semester
    }

    subjects_collection.insert_one(subject)
    return jsonify({"success": True, "message": "Subject added successfully"}), 201

@app.route("/api/save-attendance", methods=["POST"])
def save_attendance():
    data = request.get_json()

    required_fields = ["roll", "name", "branch", "semester", "subject_code", "date", "status"]
    if not all(field in data and data[field] for field in required_fields):
        return jsonify({"message": "Missing required fields"}), 400

    # Accept "roll" as standard everywhere
    roll = data["roll"]

    student = students_collection.find_one({"$or": [{"roll": roll}, {"roll_no": roll}]})
    if not student:
        return jsonify({"message": "Student not found in database"}), 404

    try:
        from datetime import datetime
        datetime.strptime(data["date"], "%Y-%m-%d")
    except:
        return jsonify({"message": "Invalid date format"}), 400

    existing = attendance_collection.find_one({
        "$or": [{"roll": roll}, {"roll_no": roll}],
        "date": data["date"],
        "subject_code": data["subject_code"]
    })

    # Update if exists
    if existing:
        attendance_collection.update_one(
            {"_id": existing["_id"]},
            {"$set": {
                "status": data["status"],
                "semester": data["semester"],
                "branch": data["branch"],
                "name": data["name"],
                "roll": roll,
                "subject_code": data["subject_code"]
            }}
        )
        return jsonify({"message": "Attendance updated"}), 200

    # Insert if not exists
    attendance_collection.insert_one({
        "roll": roll,
        "name": data["name"],
        "branch": data["branch"],
        "semester": data["semester"],
        "date": data["date"],
        "status": data["status"],
        "subject_code": data["subject_code"]
    })
    return jsonify({"message": "Attendance saved"}), 201


@app.route("/api/student", methods=["GET"])
def get_student_by_roll_sem_branch():
    roll = request.args.get("roll", "").strip()
    branch = request.args.get("branch", "").strip().upper()
    semester = request.args.get("semester", "").strip()

    if not roll or not branch or not semester:
        return jsonify({"message": "Roll number, branch, and semester required"}), 400

    try:
        semester = int(semester)
    except ValueError:
        return jsonify({"message": "Semester must be a number"}), 400

    student = students_collection.find_one({
        "roll_no": roll,
        "branch": branch,
        "semester": semester
    })

    if not student:
        return jsonify({"message": "Student not found"}), 404

    return jsonify({
        "roll": student.get("roll_no"),
        "name": student.get("name"),
        "branch": student.get("branch"),
        "semester": student.get("semester")
    }), 200

import os
from flask import request, jsonify
from app import students_collection, logger  # adjust imports if different

# Path where your student face images are stored
IMAGE_DIR = r"C:\Users\shrin\OneDrive\Desktop\Smart-Attendance-System-main\data\known_faces"

@app.route("/promote-semester", methods=["POST"])
def promote_semester():
    try:
        data = request.get_json() or {}
        current_semester = int(data.get("semester", 0))
        branch = data.get("branch")
        exclude_rolls = data.get("excludeRolls", [])

        if not current_semester:
            return jsonify({"error": "Semester is required"}), 400
        if current_semester >= 8:
            return jsonify({"message": "Semester 8 cannot be promoted"}), 400

        next_semester = current_semester + 1

        # Clean excluded rolls (as strings, since DB stores roll_no as string)
        exclude_rolls_cleaned = [str(r).strip() for r in exclude_rolls if r.strip()]

        # Build query — use 'roll_no' field instead of 'roll'
        query = {
            "semester": current_semester,
            "roll_no": {"$nin": exclude_rolls_cleaned}  # exclude students properly
        }
        if branch:
            query["branch"] = branch.strip().upper()

        students_to_update = list(students_collection.find(query))
        if not students_to_update:
            return jsonify({"message": "No eligible students found to promote"}), 404

        # Update DB only for non-excluded students
        update_result = students_collection.update_many(
            query,
            {"$set": {"semester": next_semester}}
        )

        # Rename only non-excluded image files
        renamed_files = 0
        for filename in os.listdir(IMAGE_DIR):
            if not filename.lower().endswith((".jpg", ".jpeg", ".png")):
                continue

            name_part, ext = os.path.splitext(filename)
            parts = name_part.split("_")
            if len(parts) < 4:
                continue

            roll_no, file_sem, student_name, file_branch = parts

            # Skip excluded rolls
            if roll_no in exclude_rolls_cleaned:
                continue

            if int(file_sem) != current_semester:
                continue
            if branch and file_branch.upper() != branch.upper():
                continue

            new_filename = f"{roll_no}_{next_semester}_{student_name}_{file_branch}{ext}"
            os.rename(os.path.join(IMAGE_DIR, filename),
                      os.path.join(IMAGE_DIR, new_filename))
            renamed_files += 1

        return jsonify({
            "message": f"Promoted {update_result.modified_count} students "
                       f"from semester {current_semester} to {next_semester}. "
                       f"Renamed {renamed_files} files.",
            "students_updated": update_result.modified_count,
            "files_renamed": renamed_files
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}, 500)


if __name__ == '__main__':
    try:
        logger.info("Starting server on http://localhost:8080")
        app.run(host='127.0.0.1', port=8080, debug=True)
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        raise