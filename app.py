from flask import Flask, render_template, request, jsonify, send_from_directory, url_for
import face_recognizer
import base64
import os
from werkzeug.utils import secure_filename
import numpy as np
import cv2
import face_recognition

app = Flask(__name__)

UPLOAD_FOLDER = os.path.join('static', 'image', 'faces')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'webp'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

_recognizer_initialized = False

def ensure_recognizer_initialized():
    global _recognizer_initialized
    if not _recognizer_initialized:
        try:
            face_recognizer.initialize_recognizer()
            _recognizer_initialized = True
            print("[INFO] Reconhecedor de faces inicializado/recarregado com sucesso.")
        except Exception as e:
            print(f"[ERRO CRÍTICO] Falha na inicialização do reconhecedor de faces: {e}")

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    ensure_recognizer_initialized()
    return render_template('index.html')

@app.route('/process_frame', methods=['POST'])
def process_frame():
    ensure_recognizer_initialized()
    data = request.get_json()
    if not data or 'image' not in data:
        return jsonify({"error": "Nenhum dado de imagem recebido"}), 400

    img_data_b64 = data['image'].split(',')[1]

    try:
        img_bytes = base64.b64decode(img_data_b64)
        results = face_recognizer.recognize_faces_in_frame(img_bytes)
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": f"Erro no processamento facial: {str(e)}"}), 500

@app.route('/upload_face', methods=['POST'])
def upload_face():
    if 'file' not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "Nenhum arquivo selecionado"}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file_bytes = file.read()

        try:
            np_array = np.frombuffer(file_bytes, np.uint8)
            image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
            if image is None:
                return jsonify({"error": "Imagem inválida ou corrompida."}), 400

            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            face_encodings = face_recognition.face_encodings(rgb_image)

            if not face_encodings:
                return jsonify({"error": "Nenhum rosto detectado na imagem."}), 400

            with open(file_path, 'wb') as f:
                f.write(file_bytes)

            face_recognizer.initialize_recognizer()
            print("[INFO] Reconhecedor de faces recarregado após upload.")
            return jsonify({"message": f"Rosto '{filename}' carregado com sucesso!"}), 200

        except Exception as e:
            return jsonify({"error": f"Erro ao processar a imagem: {str(e)}"}), 500
    else:
        return jsonify({"error": "Tipo de arquivo não permitido."}), 400

@app.route('/list_faces', methods=['GET'])
def list_faces():
    ensure_recognizer_initialized()
    faces = []
    folder = app.config['UPLOAD_FOLDER']
    if os.path.exists(folder):
        for filename in os.listdir(folder):
            if os.path.isfile(os.path.join(folder, filename)) and allowed_file(filename):
                faces.append({
                    "name": os.path.splitext(filename)[0],
                    "filename": filename,
                    "url": url_for('static', filename=f"image/faces/{filename}")
                })
    return jsonify({"faces": faces}), 200

@app.route('/delete_face', methods=['POST'])
def delete_face():
    data = request.get_json()
    filename_to_delete = data.get('filename')
    if not filename_to_delete:
        return jsonify({"error": "Nome do arquivo não fornecido"}), 400

    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename_to_delete)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        try:
            os.remove(file_path)
            face_recognizer.initialize_recognizer()
            print("[INFO] Reconhecedor de faces recarregado após exclusão.")
            return jsonify({"message": f"Rosto '{filename_to_delete}' excluído com sucesso!"}), 200
        except Exception as e:
            return jsonify({"error": f"Erro ao excluir: {str(e)}"}), 500
    else:
        return jsonify({"error": "Arquivo não encontrado."}), 404

if __name__ == '__main__':
    ensure_recognizer_initialized()
    app.run(debug=True)
