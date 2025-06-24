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
    // NOVO: Captura o novo botão visual de upload
    const selectAndUploadBtn = document.getElementById('selectAndUploadBtn');

    const faceSelect = document.getElementById('faceSelect');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const deleteMessage = document.getElementById('deleteMessage');

    const rootStyles = getComputedStyle(document.documentElement);
    const primaryColor = rootStyles.getPropertyValue('--primary-color').trim();

    statusText.textContent = 'Inicializando câmera...';
    overlayMessage.textContent = 'Aguardando câmera...';

    // Função para atualizar o estado do botão de exclusão
    // Desabilita o botão se a opção selecionada for a vazia ("Selecione uma imagem...")
    const updateDeleteButtonState = () => {
        deleteSelectedBtn.disabled = !faceSelect.value;
    };

    // Carrega os rostos conhecidos e popula o dropdown
    const loadKnownFaces = async () => {
        try {
            const response = await fetch('/list_faces');
            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

            const data = await response.json();
            faceSelect.innerHTML = '<option value="">Selecione uma imagem para excluir</option>'; // Limpa e adiciona a opção padrão

            if (data.faces && data.faces.length > 0) {
                data.faces.forEach(face => {
                    const option = document.createElement('option');
                    option.value = face.filename;
                    option.textContent = face.name;
                    faceSelect.appendChild(option);
                });
            } else {
                // Se não houver rostos, adiciona uma opção indicando isso e a desabilita
                const option = new Option("Nenhum rosto cadastrado", "", true, false);
                option.disabled = true;
                faceSelect.appendChild(option);
            }
            // Limpa a mensagem de exclusão após recarregar a lista
            deleteMessage.textContent = '';
            deleteMessage.className = '';
        } catch (error) {
            console.error('Erro ao carregar rostos:', error);
            faceSelect.innerHTML = '<option disabled>Erro ao carregar rostos</option>';
            showFeedback(deleteMessage, 'Erro ao carregar lista de rostos.', true);
        } finally {
            // Garante que o estado do botão de exclusão seja atualizado após o carregamento,
            // independentemente de ter encontrado rostos ou ter ocorrido um erro.
            updateDeleteButtonState();
        }
    };

    // Função para exibir feedback (sucesso/erro) na interface
    const showFeedback = (element, message, isError = false) => {
        element.textContent = message;
        element.className = isError ? 'alert alert-danger mt-2' : 'alert alert-success mt-2';
        setTimeout(() => {
            element.textContent = '';
            element.className = '';
        }, 5000);
    };

    // NOVO: Listener para o botão visual "Adicionar Imagem"
    selectAndUploadBtn.addEventListener('click', () => {
        faceImageInput.click(); // Dispara o clique no input de arquivo escondido
    });

    // NOVO: Listener para o input de arquivo real
    // Este evento é disparado quando o usuário seleciona um arquivo
    faceImageInput.addEventListener('change', () => {
        // Verifica se um arquivo foi realmente selecionado
        if (faceImageInput.files.length > 0) {
            // Dispara o evento de submit no formulário programaticamente
            // Isso acionará o `uploadForm.addEventListener('submit', ...)`
            uploadForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    });

    // Listener principal para o submit do formulário de upload
    uploadForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Impede o envio padrão do formulário (que recarregaria a página)

        const file = faceImageInput.files[0];
        if (!file) {
            // Esta condição é para caso o evento 'change' seja disparado sem um arquivo (o que é raro com `required`)
            // ou se alguém tentar manipular o JS.
            showFeedback(uploadMessage, 'Por favor, selecione uma imagem.', true);
            return;
        }

        // Agora, o botão de submissão que mostramos o feedback é o 'selectAndUploadBtn'
        const submitButton = selectAndUploadBtn;
        submitButton.disabled = true; // Desabilita o botão para evitar múltiplos envios
        submitButton.textContent = 'Adicionando...'; // Muda o texto para indicar processamento

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload_face', {
                method: 'POST',
                body: formData
            });
            const data = await response.json(); // Tenta ler a resposta JSON
            if (response.ok) {
                showFeedback(uploadMessage, data.message);
                faceImageInput.value = ''; // Limpa o input de arquivo para permitir novo upload
                await loadKnownFaces(); // Recarrega a lista para mostrar o novo rosto no dropdown
            } else {
                // Se a resposta não for OK (ex: 400 Bad Request, 500 Internal Server Error)
                showFeedback(uploadMessage, data.error || `Erro: ${response.statusText}`, true);
            }
        } catch (error) {
            console.error('Erro ao fazer upload:', error);
            showFeedback(uploadMessage, 'Erro ao conectar com o servidor.', true);
        } finally {
            // Reabilita o botão e restaura o texto original, independentemente do sucesso ou falha
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="bi bi-person-plus"></i> Adicionar Imagem'; // Volta ao ícone e texto original
        }
    });

    // Listener para quando a seleção no dropdown de exclusão muda
    faceSelect.addEventListener('change', updateDeleteButtonState);

    // Listener para o botão de exclusão
    deleteSelectedBtn.addEventListener('click', async () => {
        const filenameToDelete = faceSelect.value;
        if (!filenameToDelete) {
            showFeedback(deleteMessage, 'Selecione uma imagem para excluir.', true);
            return;
        }

        const selectedName = faceSelect.options[faceSelect.selectedIndex].text;
        // Pede confirmação antes de excluir
        if (confirm(`Deseja realmente excluir o rosto "${selectedName}"? Esta ação é irreversível.`)) {
            deleteSelectedBtn.disabled = true; // Desabilita o botão durante a exclusão
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
                    await loadKnownFaces(); // Recarrega a lista de rostos após a exclusão
                } else {
                    showFeedback(deleteMessage, data.error || `Erro: ${response.statusText}`, true);
                }
            } catch (error) {
                console.error('Erro ao excluir imagem:', error);
                showFeedback(deleteMessage, 'Erro ao conectar com o servidor.', true);
            } finally {
                // Reabilita o botão e restaura o texto original
                deleteSelectedBtn.disabled = false;
                deleteSelectedBtn.innerHTML = '<i class="bi bi-trash"></i> Excluir'; // Volta ao ícone e texto original
                updateDeleteButtonState(); // Garante que o estado do botão seja atualizado após a operação
            }
        }
    });

    // Inicialização da câmera
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
    const recognitionInterval = 500; // Intervalo de 500ms (0.5 segundos)

    function sendFramePeriodically() {
        requestAnimationFrame(sendFramePeriodically);

        const now = Date.now();
        if (now - lastRecognitionTime < recognitionInterval) return;
        lastRecognitionTime = now;

        context.clearRect(0, 0, canvas.width, canvas.height);

        // Desenha o vídeo espelhado no canvas (comum para webcams)
        context.save();
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        context.restore();

        const imageData = canvas.toDataURL('image/jpeg', 0.7); // Qualidade JPEG 0.7

        fetch('/process_frame', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        })
        .then(response => {
            if (!response.ok) {
                // Se a resposta não for OK, tenta ler a mensagem de erro do servidor
                return response.json().then(errorData => {
                    throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
                });
            }
            return response.json();
        })
        .then(data => {
            // Limpa o canvas para redesenhar as caixas
            context.clearRect(0, 0, canvas.width, canvas.height);

            // Redesenha o vídeo espelhado
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

                    // Desenha o retângulo do rosto
                    context.strokeStyle = primaryColor;
                    context.lineWidth = 4;
                    context.strokeRect(left, top, right - left, bottom - top);

                    // Desenha o fundo do nome
                    context.fillStyle = primaryColor;
                    context.fillRect(left, bottom - 35, right - left, 35);

                    // Desenha o nome
                    context.fillStyle = 'white';
                    context.font = '24px Poppins';
                    context.fillText(name, left + 6, bottom - 6);

                    recognizedNames.push(name);
                });
                lastRecognitionSpan.textContent = recognizedNames.join(', ');
                statusText.textContent = 'Câmera ativa. Detectando rostos...'; // Restaura status
            } else {
                lastRecognitionSpan.textContent = 'Nenhum rosto detectado';
                statusText.textContent = 'Câmera ativa. Detectando rostos...'; // Restaura status
            }
        })
        .catch(error => {
            console.error('Erro no processamento do frame:', error);
            statusText.textContent = 'Erro ao processar imagem!';
            lastRecognitionSpan.textContent = 'Erro na comunicação com o servidor.';
            // Opcional: tentar carregar os rostos novamente em caso de erro persistente no backend
            // setTimeout(loadKnownFaces, 5000);
        });
    }

    // Carrega os rostos conhecidos na inicialização da página
    loadKnownFaces();
});