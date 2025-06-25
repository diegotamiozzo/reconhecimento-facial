document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const overlayMessage = document.getElementById('message');
    const statusText = document.getElementById('statusText');
    const lastRecognitionSpan = document.getElementById('lastRecognition');

    const uploadForm = document.getElementById('uploadForm');
    const faceImageInput = document.getElementById('faceImageInput');
    const uploadMessage = document.getElementById('uploadMessage');
    const selectAndUploadBtn = document.getElementById('selectAndUploadBtn');

    const faceSelect = document.getElementById('faceSelect');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const deleteMessage = document.getElementById('deleteMessage');

    const rootStyles = getComputedStyle(document.documentElement);
    const primaryColor = rootStyles.getPropertyValue('--primary-color').trim();

    statusText.textContent = 'Inicializando câmera...';
    overlayMessage.textContent = 'Aguardando câmera...';

    const updateDeleteButtonState = () => {
        deleteSelectedBtn.disabled = !faceSelect.value;
    };

    const loadKnownFaces = async () => {
        try {
            const response = await fetch('/list_faces');
            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

            const data = await response.json();
            faceSelect.innerHTML = '<option value="">Selecione uma imagem para excluir</option>';

            if (data.faces && data.faces.length > 0) {
                data.faces.forEach(face => {
                    const option = document.createElement('option');
                    option.value = face.filename;
                    option.textContent = face.name;
                    faceSelect.appendChild(option);
                });
            } else {
                const option = new Option("Nenhum rosto cadastrado", "", true, false);
                option.disabled = true;
                faceSelect.appendChild(option);
            }
            deleteMessage.textContent = '';
            deleteMessage.className = '';
        } catch (error) {
            console.error('Erro ao carregar rostos:', error);
            faceSelect.innerHTML = '<option disabled>Erro ao carregar rostos</option>';
            showFeedback(deleteMessage, 'Erro ao carregar lista de rostos.', true);
        } finally {
            updateDeleteButtonState();
        }
    };

    const showFeedback = (element, message, isError = false) => {
        element.textContent = message;
        element.className = isError ? 'alert alert-danger mt-2' : 'alert alert-success mt-2';
        setTimeout(() => {
            element.textContent = '';
            element.className = '';
        }, 5000);
    };

    selectAndUploadBtn.addEventListener('click', () => {
        faceImageInput.click();
    });

    faceImageInput.addEventListener('change', () => {
        if (faceImageInput.files.length > 0) {
            uploadForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    });

    uploadForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const file = faceImageInput.files[0];
        if (!file) {
            showFeedback(uploadMessage, 'Por favor, selecione uma imagem.', true);
            return;
        }

        const submitButton = selectAndUploadBtn;
        submitButton.disabled = true;
        submitButton.textContent = 'Adicionando...';

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload_face', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                showFeedback(uploadMessage, data.message);
                faceImageInput.value = '';
                await loadKnownFaces();
            } else {
                showFeedback(uploadMessage, data.error || `Erro: ${response.statusText}`, true);
            }
        } catch (error) {
            console.error('Erro ao fazer upload:', error);
            showFeedback(uploadMessage, 'Erro ao conectar com o servidor.', true);
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="bi bi-person-plus"></i> Adicionar Imagem';
        }
    });

    faceSelect.addEventListener('change', updateDeleteButtonState);

    deleteSelectedBtn.addEventListener('click', async () => {
        const filenameToDelete = faceSelect.value;
        if (!filenameToDelete) {
            showFeedback(deleteMessage, 'Selecione uma imagem para excluir.', true);
            return;
        }

        const selectedName = faceSelect.options[faceSelect.selectedIndex].text;
        if (confirm(`Deseja realmente excluir o rosto "${selectedName}"? Esta ação é irreversível.`)) {
            deleteSelectedBtn.disabled = true;
            deleteSelectedBtn.textContent = 'Excluindo...';

            try {
                const response = await fetch('/delete_face', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: filenameToDelete })
                });
                const data = await response.json();
                if (response.ok) {
                    showFeedback(deleteMessage, data.message);
                    await loadKnownFaces();
                } else {
                    showFeedback(deleteMessage, data.error || `Erro: ${response.statusText}`, true);
                }
            } catch (error) {
                console.error('Erro ao excluir imagem:', error);
                showFeedback(deleteMessage, 'Erro ao conectar com o servidor.', true);
            } finally {
                deleteSelectedBtn.disabled = false;
                deleteSelectedBtn.innerHTML = '<i class="bi bi-trash"></i> Excluir';
                updateDeleteButtonState();
            }
        }
    });

    navigator.mediaDevices.getUserMedia({ video: true })
        .then(stream => {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.play();
                overlayMessage.style.display = 'none';
                statusText.textContent = 'Câmera ativa. Detectando rostos...';
                sendFramePeriodically();
            };
        })
        .catch(err => {
            console.error("Erro ao acessar a câmera: ", err);
            statusText.textContent = 'Erro ao acessar a câmera!';
            overlayMessage.textContent = 'Erro: Verifique as permissões da câmera.';
            overlayMessage.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
        });

    let lastRecognitionTime = 0;
    const recognitionInterval = 500;

    function sendFramePeriodically() {
        requestAnimationFrame(sendFramePeriodically);

        const now = Date.now();
        if (now - lastRecognitionTime < recognitionInterval) return;
        lastRecognitionTime = now;

        context.clearRect(0, 0, canvas.width, canvas.height);

        context.save();
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        context.restore();

        const imageData = canvas.toDataURL('image/jpeg', 0.7);

        fetch('/process_frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
                });
            }
            return response.json();
        })
        .then(data => {
            context.clearRect(0, 0, canvas.width, canvas.height);

            context.save();
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            context.restore();

            if (data.length > 0) {
                let recognizedNames = [];
                data.forEach(face => {
                    const { top, right, bottom, left } = face.box;
                    const name = face.name;

                    context.strokeStyle = primaryColor;
                    context.lineWidth = 4;
                    context.strokeRect(left, top, right - left, bottom - top);

                    context.fillStyle = primaryColor;
                    context.fillRect(left, bottom - 35, right - left, 35);

                    context.fillStyle = 'white';
                    context.font = '24px Poppins';
                    context.fillText(name, left + 6, bottom - 6);

                    recognizedNames.push(name);
                });
                lastRecognitionSpan.textContent = recognizedNames.join(', ');
                statusText.textContent = 'Câmera ativa. Detectando rostos...';
            } else {
                lastRecognitionSpan.textContent = 'Nenhum rosto detectado';
                statusText.textContent = 'Câmera ativa. Detectando rostos...';
            }
        })
        .catch(error => {
            console.error('Erro no processamento do frame:', error);
            statusText.textContent = 'Erro ao processar imagem!';
            lastRecognitionSpan.textContent = 'Erro na comunicação com o servidor.';
        });
    }

    loadKnownFaces();
});
