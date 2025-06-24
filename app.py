from flask import Flask, render_template, request, jsonify, send_from_directory, url_for
import face_recognizer
import base64
import os
from werkzeug.utils import secure_filename
import numpy as np
import cv2
import face_recognition # Importado aqui também para uso direto na validação de upload

app = Flask(__name__)

# Caminho correto da pasta onde as imagens serão salvas e servidas
UPLOAD_FOLDER = os.path.join('static', 'image', 'faces')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'webp'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Garante que a pasta de upload exista no início da aplicação
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Variável para controlar se o reconhecedor já foi inicializado
# Isso é seguro com Gunicorn, pois cada worker terá sua própria instância.
_recognizer_initialized = False

# Função auxiliar para garantir que o reconhecedor seja inicializado apenas uma vez por worker
def ensure_recognizer_initialized():
    global _recognizer_initialized
    if not _recognizer_initialized:
        try:
            face_recognizer.initialize_recognizer()
            _recognizer_initialized = True
            print("[INFO] Reconhecedor de faces inicializado/recarregado com sucesso.")
        except Exception as e:
            print(f"[ERRO CRÍTICO] Falha na inicialização do reconhecedor de faces: {e}")
            # Dependendo da gravidade, você pode querer levantar a exceção ou sair
            # para evitar que o app rode com um reconhecedor não funcional.
            # No entanto, para um deploy que não trave, apenas logar é um bom começo.


# Verifica extensão permitida
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    # Garante que o reconhecedor esteja inicializado ao carregar a página principal
    # Isso é importante para que o reconhecimento comece a funcionar imediatamente.
    ensure_recognizer_initialized()
    return render_template('index.html')

@app.route('/process_frame', methods=['POST'])
def process_frame():
    # Garante que o reconhecedor esteja inicializado antes de processar frames
    ensure_recognizer_initialized() # Garante que o modelo está em memória
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

        # Leitura do conteúdo do arquivo em bytes para validação
        file_bytes = file.read() 

        try:
            # Verifica se a imagem contém pelo menos um rosto
            np_array = np.frombuffer(file_bytes, np.uint8)
            image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)
            if image is None:
                return jsonify({"error": "Imagem inválida ou corrompida."}), 400

            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            face_encodings = face_recognition.face_encodings(rgb_image)

            if not face_encodings:
                return jsonify({"error": "Nenhum rosto detectado na imagem. Envie uma imagem com um rosto visível."}), 400

            # Salva o arquivo no disco
            with open(file_path, 'wb') as f:
                f.write(file_bytes)

            # Recarrega as faces para que o face_recognizer tenha os dados atualizados
            # Não usamos ensure_recognizer_initialized() aqui porque precisamos forçar a recarga
            face_recognizer.initialize_recognizer()
            print("[INFO] Reconhecedor de faces recarregado após upload.")
            return jsonify({"message": f"Rosto '{filename}' carregado com sucesso!"}), 200

        except Exception as e:
            return jsonify({"error": f"Erro ao processar a imagem: {str(e)}"}), 500
    else:
        return jsonify({"error": "Tipo de arquivo não permitido."}), 400


@app.route('/list_faces', methods=['GET'])
def list_faces():
    # Garante que o reconhecedor esteja inicializado ao listar os rostos
    ensure_recognizer_initialized() # Importante caso o app suba e a primeira ação seja listar
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
            # Recarrega as faces após a exclusão
            face_recognizer.initialize_recognizer()
            print("[INFO] Reconhecedor de faces recarregado após exclusão.")
            return jsonify({"message": f"Rosto '{filename_to_delete}' excluído com sucesso!"}), 200
        except Exception as e:
            return jsonify({"error": f"Erro ao excluir: {str(e)}"}), 500
    else:
        return jsonify({"error": "Arquivo não encontrado."}), 404

if __name__ == '__main__':
    # Para desenvolvimento local, inicializa o reconhecedor uma vez
    ensure_recognizer_initialized()
    app.run(debug=True)
