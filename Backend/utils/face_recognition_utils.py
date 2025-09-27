import face_recognition
import cv2
import numpy as np
import os

# Track last detected face count (to avoid spamming)
last_face_count = -1


def load_known_faces(known_faces_dir, semester=None, branch=None):
    """
    Load known faces from directory.
    Filters by semester and branch if provided.
    Filename format: roll_sem_name_branch.jpg
    """
    known_face_encodings = []
    known_face_names = []

    if not os.path.exists(known_faces_dir):
        print(f"⚠ Directory {known_faces_dir} does not exist")
        return [], []

    for filename in os.listdir(known_faces_dir):
        if filename.lower().endswith((".jpg", ".jpeg", ".png")):
            name_part = os.path.splitext(filename)[0]
            parts = name_part.split('_')

            if len(parts) < 4:
                print(f"⚠ Skipping invalid filename: {filename}")
                continue

            roll_no, file_sem, file_name, file_branch = parts

            # Filter by semester and branch
            if semester and int(file_sem) != int(semester):
                continue
            if branch and file_branch.upper() != branch.upper():
                continue

            image_path = os.path.join(known_faces_dir, filename)
            try:
                face_image = face_recognition.load_image_file(image_path)
                face_encodings = face_recognition.face_encodings(face_image)

                if face_encodings:
                    known_face_encodings.append(face_encodings[0])
                    known_face_names.append(name_part)  # keep full format
                    print(f"✅ Loaded face: {name_part}")
                else:
                    print(f"⚠ No face found in {filename}")

            except Exception as e:
                print(f"❌ Error loading {filename}: {str(e)}")
                continue

    return known_face_encodings, known_face_names


def process_frame(frame, known_face_encodings, known_face_names, tolerance=0.5):
    """
    Process a single frame for face recognition using distance-based matching.
    Supports multiple faces in one frame.
    """
    global last_face_count

    # Resize frame for faster processing (less aggressive now)
    small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
    rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

    # Detect faces and encodings
    face_locations = face_recognition.face_locations(rgb_small_frame)
    face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

    # Only print when count changes
    if len(face_locations) != last_face_count:
        print(f"📸 Detected {len(face_locations)} faces in this frame")
        last_face_count = len(face_locations)

    face_names = []
    for face_encoding in face_encodings:
        name = "Unknown"
        if known_face_encodings:
            distances = face_recognition.face_distance(known_face_encodings, face_encoding)

            # Check all matches under tolerance
            matches = [i for i, d in enumerate(distances) if d < tolerance]

            if matches:
                # Pick the closest valid match
                best_match_index = matches[np.argmin([distances[i] for i in matches])]
                name = known_face_names[best_match_index]

        face_names.append(name)

    # Scale face locations back to original frame size
    face_locations = [(top * 2, right * 2, bottom * 2, left * 2)
                      for (top, right, bottom, left) in face_locations]

    return face_locations, face_names


def draw_face_boxes(frame, face_locations, face_names):
    """
    Draw boxes and names around detected faces.
    """
    for (top, right, bottom, left), name in zip(face_locations, face_names):
        # Draw rectangle around face
        cv2.rectangle(frame, (left, top), (right, bottom), (0, 255, 0), 2)
        # Draw label background
        cv2.rectangle(frame, (left, bottom - 35), (right, bottom), (0, 255, 0), cv2.FILLED)
        # Draw text
        cv2.putText(frame, name, (left + 6, bottom - 6),
                    cv2.FONT_HERSHEY_DUPLEX, 0.6, (255, 255, 255), 1)
    return frame
