class FaceRecognitionApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.context = this.canvas.getContext('2d');
        this.overlayMessage = document.getElementById('overlayMessage');
        this.statusText = document.getElementById('statusText');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.lastRecognitionSpan = document.getElementById('lastRecognition');
        this.faceCountSpan = document.getElementById('faceCount');
        
        // Form elements
        this.uploadForm = document.getElementById('uploadForm');
        this.personNameInput = document.getElementById('personName');
        this.faceImageInput = document.getElementById('faceImageInput');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.uploadMessage = document.getElementById('uploadMessage');
        
        // Management elements
        this.faceSelect = document.getElementById('faceSelect');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.deleteBtn = document.getElementById('deleteBtn');
        this.manageMessage = document.getElementById('manageMessage');
        
        // Statistics
        this.totalFacesSpan = document.getElementById('totalFaces');
        this.detectedFacesSpan = document.getElementById('detectedFaces');
        
        // State
        this.isProcessing = false;
        this.lastRecognitionTime = 0;
        this.recognitionInterval = 500; // ms
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.initializeCamera();
        this.loadKnownFaces();
    }
    
    setupEventListeners() {
        // Upload form
        this.uploadForm.addEventListener('submit', (e) => this.handleUpload(e));
        
        // Face management
        this.faceSelect.addEventListener('change', () => this.updateDeleteButtonState());
        this.refreshBtn.addEventListener('click', () => this.loadKnownFaces());
        this.deleteBtn.addEventListener('click', () => this.handleDelete());
        
        // Form validation
        this.uploadForm.addEventListener('input', () => this.validateForm());
    }
    
    async initializeCamera() {
        try {
            this.updateStatus('Requesting camera access...', 'loading');
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                } 
            });
            
            this.video.srcObject = stream;
            
            this.video.onloadedmetadata = () => {
                this.video.play();
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
                
                this.overlayMessage.style.display = 'none';
                this.updateStatus('Camera active. Detecting faces...', 'active');
                this.startFaceRecognition();
            };
            
        } catch (error) {
            console.error('Camera access error:', error);
            this.updateStatus('Camera access denied!', 'error');
            this.showOverlayMessage('Error: Please check camera permissions', true);
        }
    }
    
    startFaceRecognition() {
        const processFrame = () => {
            if (this.isProcessing) {
                requestAnimationFrame(processFrame);
                return;
            }
            
            const now = Date.now();
            if (now - this.lastRecognitionTime < this.recognitionInterval) {
                requestAnimationFrame(processFrame);
                return;
            }
            
            this.lastRecognitionTime = now;
            this.processCurrentFrame();
            requestAnimationFrame(processFrame);
        };
        
        requestAnimationFrame(processFrame);
    }
    
    async processCurrentFrame() {
        if (!this.video.videoWidth || !this.video.videoHeight) return;
        
        this.isProcessing = true;
        
        try {
            // Clear canvas and draw current frame
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.context.save();
            this.context.scale(-1, 1);
            this.context.drawImage(this.video, -this.canvas.width, 0, this.canvas.width, this.canvas.height);
            this.context.restore();
            
            // Get image data
            const imageData = this.canvas.toDataURL('image/jpeg', 0.8);
            
            // Send to server for processing
            const response = await fetch('/api/process-frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP Error: ${response.status}`);
            }
            
            const data = await response.json();
            this.drawFaceDetections(data.faces || []);
            this.updateDetectionStats(data.faces || []);
            
        } catch (error) {
            console.error('Frame processing error:', error);
            this.updateStatus('Error processing frame!', 'error');
            this.lastRecognitionSpan.textContent = 'Server communication error';
        } finally {
            this.isProcessing = false;
        }
    }
    
    drawFaceDetections(faces) {
        // Redraw the frame
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.context.save();
        this.context.scale(-1, 1);
        this.context.drawImage(this.video, -this.canvas.width, 0, this.canvas.width, this.canvas.height);
        this.context.restore();
        
        if (faces.length > 0) {
            const recognizedNames = [];
            
            faces.forEach(face => {
                const { top, right, bottom, left } = face.box;
                const name = face.name;
                const confidence = face.confidence || 0;
                
                // Adjust coordinates for mirrored display
                const adjustedLeft = this.canvas.width - right;
                const adjustedRight = this.canvas.width - left;
                
                // Draw bounding box with better visibility
                this.context.strokeStyle = name === 'Unknown' ? '#ffc107' : '#28a745';
                this.context.lineWidth = 3;
                this.context.setLineDash([]);
                this.context.strokeRect(adjustedLeft, top, adjustedRight - adjustedLeft, bottom - top);
                
                // Draw semi-transparent background for better visibility
                this.context.fillStyle = name === 'Unknown' ? 'rgba(255, 193, 7, 0.1)' : 'rgba(40, 167, 69, 0.1)';
                this.context.fillRect(adjustedLeft, top, adjustedRight - adjustedLeft, bottom - top);
                
                // Draw label background
                const labelText = confidence > 0 ? `${name} (${Math.round(confidence * 100)}%)` : name;
                this.context.font = 'bold 14px Inter, sans-serif';
                const textWidth = this.context.measureText(labelText).width;
                
                // Draw label background with padding
                this.context.fillStyle = name === 'Unknown' ? '#ffc107' : '#28a745';
                this.context.fillRect(adjustedLeft, top - 28, textWidth + 16, 24);
                
                // Draw label text
                this.context.fillStyle = name === 'Unknown' ? '#212529' : 'white';
                this.context.fillText(labelText, adjustedLeft + 8, top - 10);
                
                recognizedNames.push(name);
            });
            
            this.lastRecognitionSpan.textContent = recognizedNames.join(', ');
        } else {
            this.lastRecognitionSpan.textContent = 'No faces detected';
        }
    }
    
    updateDetectionStats(faces) {
        this.detectedFacesSpan.textContent = faces.length;
    }
    
    updateStatus(message, type = 'default') {
        this.statusText.textContent = message;
        
        // Update status indicator
        this.statusIndicator.className = 'status-indicator';
        if (type === 'active') {
            this.statusIndicator.classList.add('active', 'pulse');
        } else if (type === 'error') {
            this.statusIndicator.classList.add('error');
        }
    }
    
    showOverlayMessage(message, isError = false) {
        this.overlayMessage.innerHTML = `
            ${isError ? '<i class="bi bi-exclamation-triangle me-2"></i>' : '<div class="spinner-border spinner-border-sm me-2"></div>'}
            <span>${message}</span>
        `;
        this.overlayMessage.style.display = 'block';
        this.overlayMessage.style.backgroundColor = isError ? 'rgba(220, 53, 69, 0.9)' : 'rgba(0, 0, 0, 0.8)';
    }
    
    showFeedback(element, message, isError = false, duration = 5000) {
        element.innerHTML = `
            <div class="alert ${isError ? 'alert-danger' : 'alert-success'} alert-dismissible fade show slide-up" role="alert">
                <i class="bi ${isError ? 'bi-exclamation-triangle' : 'bi-check-circle'} me-2"></i>
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `;
        
        if (duration > 0) {
            setTimeout(() => {
                const alert = element.querySelector('.alert');
                if (alert) {
                    const bsAlert = new bootstrap.Alert(alert);
                    bsAlert.close();
                }
            }, duration);
        }
    }
    
    validateForm() {
        const name = this.personNameInput.value.trim();
        const file = this.faceImageInput.files[0];
        
        this.uploadBtn.disabled = !name || !file;
        
        // Add validation classes
        if (name) {
            this.personNameInput.classList.remove('is-invalid');
            this.personNameInput.classList.add('is-valid');
        } else {
            this.personNameInput.classList.remove('is-valid');
        }
        
        if (file) {
            this.faceImageInput.classList.remove('is-invalid');
            this.faceImageInput.classList.add('is-valid');
        } else {
            this.faceImageInput.classList.remove('is-valid');
        }
    }
    
    async handleUpload(event) {
        event.preventDefault();
        
        const name = this.personNameInput.value.trim();
        const file = this.faceImageInput.files[0];
        
        if (!name || !file) {
            this.showFeedback(this.uploadMessage, 'Please provide both name and image.', true);
            return;
        }
        
        // Update button state
        this.uploadBtn.disabled = true;
        this.uploadBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Adding...';
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', name);
            
            const response = await fetch('/api/upload-face', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                this.showFeedback(this.uploadMessage, data.message);
                this.uploadForm.reset();
                this.validateForm();
                await this.loadKnownFaces();
            } else {
                this.showFeedback(this.uploadMessage, data.error || 'Upload failed', true);
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showFeedback(this.uploadMessage, 'Error connecting to server.', true);
        } finally {
            this.uploadBtn.disabled = false;
            this.uploadBtn.innerHTML = '<i class="bi bi-cloud-upload me-2"></i>Add Face';
        }
    }
    
    async loadKnownFaces() {
        try {
            this.refreshBtn.disabled = true;
            this.refreshBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Loading...';
            
            const response = await fetch('/api/faces');
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const data = await response.json();
            
            // Update face select dropdown
            this.faceSelect.innerHTML = '<option value="">Select a face to delete</option>';
            
            if (data.faces && data.faces.length > 0) {
                data.faces.forEach(face => {
                    const option = document.createElement('option');
                    option.value = face.filename;
                    option.textContent = face.name;
                    this.faceSelect.appendChild(option);
                });
            } else {
                const option = new Option("No faces registered", "", true, false);
                option.disabled = true;
                this.faceSelect.appendChild(option);
            }
            
            // Update statistics
            this.faceCountSpan.textContent = data.count || 0;
            this.totalFacesSpan.textContent = data.count || 0;
            
            this.manageMessage.innerHTML = '';
            
        } catch (error) {
            console.error('Error loading faces:', error);
            this.faceSelect.innerHTML = '<option disabled>Error loading faces</option>';
            this.showFeedback(this.manageMessage, 'Error loading face list.', true);
        } finally {
            this.refreshBtn.disabled = false;
            this.refreshBtn.innerHTML = '<i class="bi bi-arrow-clockwise me-2"></i>Refresh List';
            this.updateDeleteButtonState();
        }
    }
    
    updateDeleteButtonState() {
        this.deleteBtn.disabled = !this.faceSelect.value;
    }
    
    async handleDelete() {
        const filenameToDelete = this.faceSelect.value;
        if (!filenameToDelete) {
            this.showFeedback(this.manageMessage, 'Please select a face to delete.', true);
            return;
        }
        
        const selectedName = this.faceSelect.options[this.faceSelect.selectedIndex].text;
        
        // Show confirmation modal
        if (!confirm(`Are you sure you want to delete "${selectedName}"? This action cannot be undone.`)) {
            return;
        }
        
        this.deleteBtn.disabled = true;
        this.deleteBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Deleting...';
        
        try {
            const response = await fetch('/api/delete-face', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: filenameToDelete })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                this.showFeedback(this.manageMessage, data.message);
                await this.loadKnownFaces();
            } else {
                this.showFeedback(this.manageMessage, data.error || 'Delete failed', true);
            }
            
        } catch (error) {
            console.error('Delete error:', error);
            this.showFeedback(this.manageMessage, 'Error connecting to server.', true);
        } finally {
            this.deleteBtn.disabled = false;
            this.deleteBtn.innerHTML = '<i class="bi bi-trash me-2"></i>Delete Selected';
            this.updateDeleteButtonState();
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FaceRecognitionApp();
});