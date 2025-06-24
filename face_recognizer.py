import cv2
import face_recognition
import os
import numpy as np

# Caminho atualizado para os rostos conhecidos
KNOWN_FACES_FOLDER = os.path.join('static', 'image', 'faces')
ALLOWED_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp')
FACE_RECOGNITION_TOLERANCE = 0.6

known_face_encodings = []
known_face_names = []
# Removida a variável 'initialized' pois a inicialização será controlada externamente ou sempre executada.

def initialize_recognizer():
    """
    Carrega (ou recarrega) todos os rostos conhecidos da pasta KNOWN_FACES_FOLDER.
    Esta função agora sempre recarrega todos os rostos conhecidos para garantir
    que as listas estejam atualizadas após adições ou exclusões.
    """
    global known_face_encodings, known_face_names
    
    known_face_encodings = []
    known_face_names = []

    if not os.path.exists(KNOWN_FACES_FOLDER):
        os.makedirs(KNOWN_FACES_FOLDER)
        # Não lança mais FileNotFoundError aqui, apenas cria a pasta.
        # A verificação de rostos vazios será feita abaixo.

    face_files_found = False
    for filename in os.listdir(KNOWN_FACES_FOLDER):
        image_path = os.path.join(KNOWN_FACES_FOLDER, filename)

        if os.path.isfile(image_path) and filename.lower().endswith(ALLOWED_EXTENSIONS):
            try:
                image = face_recognition.load_image_file(image_path)
                face_encodings = face_recognition.face_encodings(image)

                if face_encodings:
                    known_face_encodings.append(face_encodings[0])
                    known_face_names.append(os.path.splitext(filename)[0])
                    face_files_found = True
                else:
                    print(f"[AVISO] Nenhuma face encontrada na imagem: {filename}. Será ignorada.")
            except Exception as e:
                print(f"[ERRO] Falha ao carregar ou processar imagem {filename}: {e}")

    if not face_files_found:
        print("[AVISO] Nenhuma imagem de rosto válida encontrada na pasta de rostos conhecidos. O reconhecimento pode não funcionar.")


def recognize_faces_in_frame(frame_bytes):
    # initialize_recognizer() # Não é mais necessário chamar aqui, será chamado por app.py
                            # para garantir que os rostos estejam sempre atualizados.

    np_array = np.frombuffer(frame_bytes, np.uint8)
    frame = cv2.imdecode(np_array, cv2.IMREAD_COLOR)

    if frame is None:
        return {"error": "Não foi possível decodificar a imagem."}

    # Reduzir o tamanho da imagem para detecção de face para acelerar o processo
    # e depois escalar as localizações de volta.
    small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
    rgb_small_frame = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)

    face_locations = face_recognition.face_locations(rgb_small_frame)
    face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

    results = []

    # Se não houver rostos conhecidos, todos os rostos detectados serão "Desconhecido"
    if not known_face_encodings:
        for (top, right, bottom, left) in face_locations:
            top *= 4
            right *= 4
            bottom *= 4
            left *= 4
            results.append({
                "name": "Desconhecido",
                "box": {"top": top, "right": right, "bottom": bottom, "left": left}
            })
        return results

    for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
        name = "Desconhecido"
        face_distances = face_recognition.face_distance(known_face_encodings, face_encoding)
        best_match_index = np.argmin(face_distances)

        if face_distances[best_match_index] < FACE_RECOGNITION_TOLERANCE:
            name = known_face_names[best_match_index]

        # Escalar as coordenadas de volta para o tamanho original do frame
        top *= 4
        right *= 4
        bottom *= 4
        left *= 4

        results.append({
            "name": name,
            "box": {"top": top, "right": right, "bottom": bottom, "left": left}
        })

    return results

# Tenta inicializar no carregamento do módulo.
# Isso garante que a primeira vez que o aplicativo rodar, ele tente carregar os rostos.
try:
    # Garante que a pasta exista antes da primeira inicialização
    if not os.path.exists(KNOWN_FACES_FOLDER):
        os.makedirs(KNOWN_FACES_FOLDER)
    initialize_recognizer()
except Exception as e:
    print(f"[ERRO CRÍTICO] Falha na inicialização do reconhecedor de faces: {e}")