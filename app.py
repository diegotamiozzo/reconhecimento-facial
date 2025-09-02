from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import cv2
import face_recognition
import os
import numpy as np
import base64
from werkzeug.utils import secure_filename
from PIL import Image
import io
import json

# Import our face recognition module
from face_recognizer import initialize_recognizer, recognize_faces_in_frame, get_face_count, get_known_faces

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
UPLOAD_FOLDER = os.path.join('static', 'uploads', 'faces')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'webp'}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB

# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def ensure_recognizer_initialized():
    """Ensure the face recognizer is initialized"""
    try:
        initialize_recognizer()
        return True
    except Exception as e:
        print(f"[ERROR] Failed to initialize recognizer: {e}")
        return False

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/api/process-frame', methods=['POST'])
def process_frame():
    """Process video frame for face recognition"""
    try:
        print("[DEBUG] Process frame endpoint called")
        data = request.get_json()
        if not data or 'image' not in data:
            print("[ERROR] No image data in request")
            return jsonify({'error': 'No image data provided'}), 400
        
        # Decode base64 image
        image_data = data['image']
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        print(f"[DEBUG] Decoded image bytes: {len(image_bytes)} bytes")
        
        # Process frame
        faces = recognize_faces_in_frame(image_bytes)
        
        if isinstance(faces, dict) and 'error' in faces:
            return jsonify({'error': faces['error']}), 500
        
        return jsonify({
            'success': True,
            'faces': faces,
            'count': len(faces) if isinstance(faces, list) else 0
        })
        
    except Exception as e:
        print(f"[ERROR] Frame processing error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Frame processing failed: {str(e)}'}), 500

@app.route('/api/upload-face', methods=['POST'])
def upload_face():
    """Upload and register a new face"""
    try:
        print("[DEBUG] Upload face endpoint called")
        print(f"[DEBUG] Request files: {list(request.files.keys())}")
        print(f"[DEBUG] Request form: {dict(request.form)}")
        
        # Ensure recognizer is initialized
        if not ensure_recognizer_initialized():
            return jsonify({'error': 'Face recognition system not available'}), 500
        
        # Validate request
        if 'file' not in request.files:
            print("[ERROR] No file in request")
            return jsonify({'error': 'No file provided'}), 400
        
        if 'name' not in request.form:
            print("[ERROR] No name in request")
            return jsonify({'error': 'No name provided'}), 400
        
        file = request.files['file']
        name = request.form['name'].strip()
        
        print(f"[DEBUG] Processing upload - Name: '{name}', File: '{file.filename}'")
        
        # Validate inputs
        if not name:
            return jsonify({'error': 'Name cannot be empty'}), 400
        
        if len(name) < 2:
            return jsonify({'error': 'Name must be at least 2 characters long'}), 400
        
        if len(name) > 50:
            return jsonify({'error': 'Name must be less than 50 characters'}), 400
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Please upload PNG, JPEG, BMP, TIFF, or WEBP images'}), 400
        
        # Check file size
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        if file_size > MAX_FILE_SIZE:
            return jsonify({'error': 'File too large. Maximum size is 16MB'}), 400
        
        if file_size < 1024:  # 1KB minimum
            return jsonify({'error': 'File too small. Please upload a valid image'}), 400
        
        # Create secure filename
        filename = secure_filename(f"{name}.{file.filename.rsplit('.', 1)[1].lower()}")
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        print(f"[DEBUG] Saving file to: {filepath}")
        
        # Check if face with this name already exists
        existing_faces = get_known_faces()
        if name in existing_faces:
            return jsonify({'error': f'A face with the name "{name}" already exists. Please use a different name.'}), 400
        
        # Read and validate image
        try:
            image_data = file.read()
            
            # Validate image using PIL
            image = Image.open(io.BytesIO(image_data))
            image.verify()  # Verify it's a valid image
            
            # Reset file pointer and re-read for face_recognition
            file.seek(0)
            image_data = file.read()
            
            # Convert to numpy array for face_recognition
            image_array = np.array(Image.open(io.BytesIO(image_data)))
            
            # Check for faces in the image
            face_encodings = face_recognition.face_encodings(image_array)
            
            if not face_encodings:
                return jsonify({'error': 'No face detected in the image. Please upload a clear photo with a visible face.'}), 400
            
            if len(face_encodings) > 1:
                return jsonify({'error': 'Multiple faces detected. Please upload an image with only one face.'}), 400
            
            print(f"[DEBUG] Face encoding successful, saving file")
            
            # Save the file
            with open(filepath, 'wb') as f:
                f.write(image_data)
            
            print(f"[DEBUG] File saved successfully")
            
            # Reinitialize recognizer to include new face
            initialize_recognizer()
            
            return jsonify({
                'success': True,
                'message': f'Face for "{name}" added successfully!',
                'filename': filename
            })
            
        except Exception as img_error:
            print(f"[ERROR] Image processing error: {img_error}")
            return jsonify({'error': f'Invalid image file: {str(img_error)}'}), 400
        
    except Exception as e:
        print(f"[ERROR] Upload error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/api/faces', methods=['GET'])
def get_faces():
    """Get list of registered faces"""
    try:
        faces = []
        face_count = 0
        
        if os.path.exists(UPLOAD_FOLDER):
            for filename in os.listdir(UPLOAD_FOLDER):
                if filename.startswith('.'):
                    continue
                    
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                if os.path.isfile(filepath) and allowed_file(filename):
                    name = os.path.splitext(filename)[0]
                    faces.append({
                        'name': name,
                        'filename': filename
                    })
                    face_count += 1
        
        return jsonify({
            'success': True,
            'faces': faces,
            'count': face_count
        })
        
    except Exception as e:
        print(f"[ERROR] Error getting faces: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to get faces: {str(e)}'}), 500

@app.route('/api/delete-face', methods=['DELETE'])
def delete_face():
    """Delete a registered face"""
    try:
        data = request.get_json()
        if not data or 'filename' not in data:
            return jsonify({'error': 'No filename provided'}), 400
        
        filename = data['filename']
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        if not os.path.exists(filepath):
            return jsonify({'error': 'Face not found'}), 404
        
        # Delete the file
        os.remove(filepath)
        
        # Reinitialize recognizer to remove deleted face
        initialize_recognizer()
        
        name = os.path.splitext(filename)[0]
        return jsonify({
            'success': True,
            'message': f'Face "{name}" deleted successfully!'
        })
        
    except Exception as e:
        print(f"[ERROR] Delete error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Delete failed: {str(e)}'}), 500

@app.errorhandler(413)
def too_large(e):
    """Handle file too large error"""
    return jsonify({'error': 'File too large. Maximum size is 16MB.'}), 413

@app.errorhandler(404)
def not_found(e):
    """Handle 404 errors"""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(e):
    """Handle 500 errors"""
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    print("[INFO] Starting Face Recognition App...")
    
    # Initialize the face recognizer on startup
    print("[INFO] Initializing face recognizer...")
    initialize_recognizer()
    
    # Configure Flask
    app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE
    
    print("[INFO] Server starting on http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)