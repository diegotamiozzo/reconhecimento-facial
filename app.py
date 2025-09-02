from flask import Flask, render_template, request, jsonify, url_for
import face_recognizer
import base64
import os
from werkzeug.utils import secure_filename
import numpy as np
import cv2
import face_recognition
from PIL import Image
import io

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = os.path.join('static', 'uploads', 'faces')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'webp'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

_recognizer_initialized = False

def ensure_recognizer_initialized():
    """Initialize face recognizer if not already done"""
    global _recognizer_initialized
    if not _recognizer_initialized:
        try:
            face_recognizer.initialize_recognizer()
            _recognizer_initialized = True
            print("[INFO] Face recognizer initialized successfully.")
        except Exception as e:
            print(f"[CRITICAL ERROR] Failed to initialize face recognizer: {e}")

def allowed_file(filename):
    """Check if file extension is allowed"""
    if not filename or '.' not in filename:
        return False
    extension = filename.rsplit('.', 1)[1].lower()
    return extension in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    """Main page route"""
    ensure_recognizer_initialized()
    return render_template('index.html')

@app.route('/api/process-frame', methods=['POST'])
def process_frame():
    """Process video frame for face recognition"""
    ensure_recognizer_initialized()
    
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({"error": "No image data received"}), 400

        img_data_b64 = data['image'].split(',')[1]
        img_bytes = base64.b64decode(img_data_b64)
        results = face_recognizer.recognize_faces_in_frame(img_bytes)
        
        return jsonify({
            "success": True,
            "faces": results,
            "count": len(results) if isinstance(results, list) else 0
        })
        
    except Exception as e:
        print(f"[ERROR] Frame processing error: {e}")
        return jsonify({"error": f"Face processing error: {str(e)}"}), 500

@app.route('/api/upload-face', methods=['POST'])
def upload_face():
    """Upload and register a new face"""
    try:
        print("[DEBUG] Upload request received")
        print(f"[DEBUG] Files in request: {list(request.files.keys())}")
        print(f"[DEBUG] Form data: {dict(request.form)}")
        
        if 'file' not in request.files:
            print("[ERROR] No 'file' key in request.files")
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files['file']
        name = request.form.get('name', '').strip()
        
        print(f"[DEBUG] File: {file}, Filename: {file.filename}, Name: {name}")
        
        if file.filename == '':
            print("[ERROR] Empty filename")
            return jsonify({"error": "No file selected"}), 400
            
        if not name:
            print("[ERROR] No name provided")
            return jsonify({"error": "Name is required"}), 400

        if not allowed_file(file.filename):
            print(f"[ERROR] File type not allowed: {file.filename}")
            return jsonify({"error": f"File type not allowed. Supported formats: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
        # Use the provided name instead of filename
        safe_name = secure_filename(name)
        if not safe_name:
            safe_name = "unknown_person"
        
        # Get original file extension
        original_extension = file.filename.rsplit('.', 1)[1].lower()
        filename = f"{safe_name}.{original_extension}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        
        print(f"[DEBUG] Saving to: {file_path}")
        
        try:
            file_bytes = file.read()
            print(f"[DEBUG] File size: {len(file_bytes)} bytes")

            # Validate image using PIL first
            try:
                pil_image = Image.open(io.BytesIO(file_bytes))
                pil_image.verify()  # Verify it's a valid image
                print(f"[DEBUG] PIL validation successful: {pil_image.format}")
            except Exception as e:
                print(f"[ERROR] PIL validation failed: {e}")
                return jsonify({"error": "Invalid image file"}), 400
            
            # Reset file pointer and convert to OpenCV format
            file.seek(0)
            file_bytes = file.read()
            np_array = np.frombuffer(file_bytes, np.uint8)
            image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
            
            if image is None:
                print("[ERROR] OpenCV could not decode image")
                return jsonify({"error": "Could not process image. Please try a different format."}), 400

            print(f"[DEBUG] Image shape: {image.shape}")
            
            # Convert to RGB for face_recognition
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            face_encodings = face_recognition.face_encodings(rgb_image)
            
            print(f"[DEBUG] Found {len(face_encodings)} face encodings")

            if not face_encodings:
                return jsonify({"error": "No face detected in the image. Please upload a clear photo with a visible face."}), 400
            
            if len(face_encodings) > 1:
                print(f"[WARNING] Multiple faces detected ({len(face_encodings)}), using the first one")

            # Save the image
            success = cv2.imwrite(file_path, image)
            if not success:
                print(f"[ERROR] Failed to save image to {file_path}")
                return jsonify({"error": "Failed to save image"}), 500
            
            print(f"[INFO] Image saved successfully to {file_path}")
            
            # Reinitialize recognizer
            face_recognizer.initialize_recognizer()
            print(f"[INFO] Face recognizer reloaded after uploading {name}")
            
            return jsonify({
                "success": True,
                "message": f"Face '{name}' uploaded successfully!",
                "filename": filename
            }), 200
            
        except Exception as e:
            print(f"[ERROR] Error processing file: {e}")
            return jsonify({"error": f"Error processing image: {str(e)}"}), 500

    except Exception as e:
        print(f"[ERROR] Upload error: {e}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@app.route('/api/faces', methods=['GET'])
def list_faces():
    """Get list of registered faces"""
    ensure_recognizer_initialized()
    
    try:
        faces = []
        folder = app.config['UPLOAD_FOLDER']
        
        if os.path.exists(folder):
            for filename in os.listdir(folder):
                if os.path.isfile(os.path.join(folder, filename)) and allowed_file(filename):
                    faces.append({
                        "name": os.path.splitext(filename)[0],
                        "filename": filename,
                        "url": url_for('static', filename=f"uploads/faces/{filename}")
                    })
        
        return jsonify({
            "success": True,
            "faces": faces,
            "count": len(faces)
        }), 200
        
    except Exception as e:
        print(f"[ERROR] List faces error: {e}")
        return jsonify({"error": "Error loading faces"}), 500

@app.route('/api/delete-face', methods=['DELETE'])
def delete_face():
    """Delete a registered face"""
    try:
        data = request.get_json()
        filename_to_delete = data.get('filename')
        
        if not filename_to_delete:
            return jsonify({"error": "Filename not provided"}), 400

        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename_to_delete)
        
        if os.path.exists(file_path) and os.path.isfile(file_path):
            os.remove(file_path)
            face_recognizer.initialize_recognizer()
            print(f"[INFO] Face recognizer reloaded after deleting {filename_to_delete}")
            
            return jsonify({
                "success": True,
                "message": f"Face '{os.path.splitext(filename_to_delete)[0]}' deleted successfully!"
            }), 200
        else:
            return jsonify({"error": "File not found"}), 404
            
    except Exception as e:
        print(f"[ERROR] Delete error: {e}")
        return jsonify({"error": f"Error deleting file: {str(e)}"}), 500

@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Maximum size is 16MB."}), 413

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    ensure_recognizer_initialized()
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)