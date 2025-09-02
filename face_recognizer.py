import cv2
import face_recognition
import os
import numpy as np

# Configuration
KNOWN_FACES_FOLDER = os.path.join('static', 'uploads', 'faces')
ALLOWED_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp')
FACE_RECOGNITION_TOLERANCE = 0.6

# Global variables for face data
known_face_encodings = []
known_face_names = []

def initialize_recognizer():
    """
    Load or reload all known faces from the KNOWN_FACES_FOLDER.
    This function always reloads all known faces to ensure the lists
    are updated after additions or deletions.
    """
    global known_face_encodings, known_face_names
    
    print(f"[DEBUG] Initializing recognizer, checking folder: {KNOWN_FACES_FOLDER}")
    
    # Clear existing data
    known_face_encodings = []
    known_face_names = []

    # Ensure folder exists
    if not os.path.exists(KNOWN_FACES_FOLDER):
        os.makedirs(KNOWN_FACES_FOLDER)
        print(f"[INFO] Created faces folder: {KNOWN_FACES_FOLDER}")
        return  # No faces to load yet

    face_files_found = False
    
    try:
        files_in_folder = os.listdir(KNOWN_FACES_FOLDER)
        print(f"[DEBUG] Files in folder: {files_in_folder}")
        
        for filename in files_in_folder:
            # Skip hidden files and directories
            if filename.startswith('.'):
                continue
                
            image_path = os.path.join(KNOWN_FACES_FOLDER, filename)
            print(f"[DEBUG] Processing file: {filename}")

            if os.path.isfile(image_path) and any(filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
                try:
                    print(f"[DEBUG] Loading image: {image_path}")
                    # Load and process image
                    image = face_recognition.load_image_file(image_path)
                    face_encodings = face_recognition.face_encodings(image)
                    print(f"[DEBUG] Found {len(face_encodings)} encodings in {filename}")

                    if face_encodings:
                        known_face_encodings.append(face_encodings[0])
                        known_face_names.append(os.path.splitext(filename)[0])
                        face_files_found = True
                        print(f"[INFO] Loaded face: {filename}")
                    else:
                        print(f"[WARNING] No face found in image: {filename}. Skipping.")
                        
                except Exception as e:
                    print(f"[ERROR] Failed to load or process image {filename}: {e}")
            else:
                print(f"[DEBUG] Skipping file {filename} (not a valid image or not a file)")

        if not face_files_found:
            print("[WARNING] No valid face images found in known faces folder. Recognition may not work.")
        else:
            print(f"[INFO] Successfully loaded {len(known_face_encodings)} known faces.")
            
    except Exception as e:
        print(f"[ERROR] Error accessing faces folder: {e}")

def recognize_faces_in_frame(frame_bytes):
    """
    Recognize faces in a video frame
    """
    try:
        # Decode image from bytes
        np_array = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(np_array, cv2.IMREAD_COLOR)

        if frame is None:
            return {"error": "Could not decode image"}

        # Resize frame for faster processing
        small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
        rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

        # Find faces and encodings
        face_locations = face_recognition.face_locations(rgb_small_frame)
        face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

        results = []

        # If no known faces, mark all detected faces as "Unknown"
        if not known_face_encodings:
            for (top, right, bottom, left) in face_locations:
                # Scale back up face locations
                top *= 4
                right *= 4
                bottom *= 4
                left *= 4
                
                results.append({
                    "name": "Unknown",
                    "confidence": 0.0,
                    "box": {"top": top, "right": right, "bottom": bottom, "left": left}
                })
            return results

        # Process each detected face
        for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
            name = "Unknown"
            confidence = 0.0
            
            # Calculate distances to known faces
            face_distances = face_recognition.face_distance(known_face_encodings, face_encoding)
            
            if len(face_distances) > 0:
                best_match_index = np.argmin(face_distances)
                best_distance = face_distances[best_match_index]
                
                if best_distance < FACE_RECOGNITION_TOLERANCE:
                    name = known_face_names[best_match_index]
                    confidence = 1.0 - best_distance  # Convert distance to confidence

            # Scale back up face locations to original frame size
            top *= 4
            right *= 4
            bottom *= 4
            left *= 4

            results.append({
                "name": name,
                "confidence": round(confidence, 2),
                "box": {"top": top, "right": right, "bottom": bottom, "left": left}
            })

        return results
        
    except Exception as e:
        print(f"[ERROR] Face recognition error: {e}")
        return {"error": f"Face recognition failed: {str(e)}"}

def get_face_count():
    """Get the number of registered faces"""
    return len(known_face_encodings)

def get_known_faces():
    """Get list of known face names"""
    return known_face_names.copy()