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
        
        // Add debug logging for form elements
        console.log('Form elements initialized:', {
            uploadForm: !!this.uploadForm,
            personNameInput: !!this.personNameInput,
            faceImageInput: !!this.faceImageInput,
            uploadBtn: !!this.uploadBtn
        });
    }
    
    setupEventListeners() {
        // Upload form
        if (this.uploadForm) {
            this.uploadForm.addEventListener('submit', (e) => this.handleUpload(e));
        }
        
        // Face management
        if (this.faceSelect) {
            this.faceSelect.addEventListener('change', () => this.updateDeleteButtonState());
        }
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.loadKnownFaces());
        }
        if (this.deleteBtn) {
            this.deleteBtn.addEventListener('click', () => this.handleDelete());
        }
        
        // Form validation
        if (this.uploadForm) {
            this.uploadForm.addEventListener('input', () => this.validateForm());
        }
        if (this.personNameInput) {
            this.personNameInput.addEventListener('input', () => this.validateForm());
        }
        if (this.faceImageInput) {
            this.faceImageInput.addEventListener('change', () => this.validateForm());
        }
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
            const processUrl = `${window.location.origin}/api/process-frame`;
            const response = await fetch(processUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP Error: ${response.status} - ${errorText}`);
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
        
        console.log('Validating form:', { name, file: file ? file.name : 'none' });
        
        this.uploadBtn.disabled = !name || !file;
        
        // Add validation classes
        if (name) {
            this.personNameInput.classList.remove('is-invalid');
            this.personNameInput.classList.add('is-valid');
        } else {
            this.personNameInput.classList.remove('is-valid');
        }
        
        if (file) {
            // Validate file type
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff', 'image/webp'];
            if (allowedTypes.includes(file.type)) {
                this.faceImageInput.classList.remove('is-invalid');
                this.faceImageInput.classList.add('is-valid');
            } else {
                this.faceImageInput.classList.add('is-invalid');
                this.faceImageInput.classList.remove('is-valid');
                this.uploadBtn.disabled = true;
            }
        } else {
            this.faceImageInput.classList.remove('is-invalid');
            this.faceImageInput.classList.remove('is-valid');
        }
    }
    
    async handleUpload(event) {
        event.preventDefault();
        
        console.log('Upload form submitted');
        console.log('Current URL:', window.location.href);
        
        const name = this.personNameInput.value.trim();
        const file = this.faceImageInput.files[0];
        
        console.log('Upload data:', { name, file: file ? file.name : 'none' });
        
        if (!name || !file) {
            this.showFeedback(this.uploadMessage, 'Please provide both name and image.', true);
            return;
        }
        
        // Validate name length and characters
        if (name.length < 2) {
            this.showFeedback(this.uploadMessage, 'Name must be at least 2 characters long.', true);
            return;
        }
        
        if (name.length > 50) {
            this.showFeedback(this.uploadMessage, 'Name must be less than 50 characters.', true);
            return;
        }
        
        // Validate file size (16MB limit)
        if (file.size > 16 * 1024 * 1024) {
            this.showFeedback(this.uploadMessage, 'File too large. Maximum size is 16MB.', true);
            return;
        }
        
        // Validate minimum file size (1KB)
        if (file.size < 1024) {
            this.showFeedback(this.uploadMessage, 'File too small. Please upload a valid image.', true);
            return;
        }
        
        // Validate file type
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff', 'image/webp'];
        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'];
        const fileName = file.name.toLowerCase();
        const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
        
        if (!allowedTypes.includes(file.type) || !hasValidExtension) {
            this.showFeedback(this.uploadMessage, 'Invalid file type. Please upload PNG, JPEG, BMP, TIFF, or WEBP images.', true);
            return;
        }
        
        // Update button state
        this.uploadBtn.disabled = true;
        this.uploadBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Adding...';
        
        // Clear any previous messages
        this.uploadMessage.innerHTML = '';
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', name);
            
            console.log('Sending FormData:', { name, fileName: file.name, fileSize: file.size });
            
            // Log FormData contents for debugging
            for (let [key, value] of formData.entries()) {
                console.log('FormData entry:', key, value instanceof File ? `File: ${value.name}` : value);
            }
            
            // Use absolute URL to avoid any routing issues
            const uploadUrl = `${window.location.origin}/api/upload-face`;
            console.log('Upload URL:', uploadUrl);
            
            const response = await fetch(uploadUrl, {
                method: 'POST',
                body: formData,
                // Don't set Content-Type header - let browser set it with boundary for FormData
            });
            
            console.log('Response status:', response.status);
            console.log('Response headers:', Object.fromEntries(response.headers.entries()));
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response error text:', errorText);
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log('Response data:', data);
            
            if (data.success) {
                this.showFeedback(this.uploadMessage, data.message);
                this.uploadForm.reset();
                this.personNameInput.classList.remove('is-valid');
                this.faceImageInput.classList.remove('is-valid');
                this.validateForm();
                await this.loadKnownFaces();
            } else {
                this.showFeedback(this.uploadMessage, data.error || 'Upload failed', true);
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            let errorMessage = 'Error connecting to server';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Cannot connect to server. Make sure the Flask app is running on port 5000.';
            } else {
                errorMessage = `Server error: ${error.message}`;
            }
            this.showFeedback(this.uploadMessage, errorMessage, true);
        } finally {
            this.uploadBtn.disabled = false;
            this.uploadBtn.innerHTML = '<i class="bi bi-cloud-upload me-2"></i>Add Face';
        }
    }
    
    async loadKnownFaces() {
        try {
            this.refreshBtn.disabled = true;
            this.refreshBtn.innerHTML = '<div class="spinner-border spinner-border-sm me-2"></div>Loading...';
            
            const facesUrl = `${window.location.origin}/api/faces`;
            console.log('Loading faces from:', facesUrl);
            
            const response = await fetch(facesUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP Error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            console.log('Faces data:', data);
            
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
            let errorMessage = 'Error loading face list';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Cannot connect to server. Make sure the Flask app is running.';
            } else {
                errorMessage = `Error: ${error.message}`;
            }
            this.showFeedback(this.manageMessage, errorMessage, true);
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
            const deleteUrl = `${window.location.origin}/api/delete-face`;
            const response = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: filenameToDelete })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP Error: ${response.status} - ${errorText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.showFeedback(this.manageMessage, data.message);
                await this.loadKnownFaces();
            } else {
                this.showFeedback(this.manageMessage, data.error || 'Delete failed', true);
            }
            
        } catch (error) {
            console.error('Delete error:', error);
            let errorMessage = 'Error connecting to server';
            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'Cannot connect to server. Make sure the Flask app is running.';
            } else {
                errorMessage = `Error: ${error.message}`;
            }
            this.showFeedback(this.manageMessage, errorMessage, true);
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