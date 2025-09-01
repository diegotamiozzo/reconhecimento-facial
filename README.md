# AI Face Recognition System

A modern web application for real-time face recognition using Flask, OpenCV, and face_recognition library.

## Features

- **Real-time Face Detection**: Live video feed with instant face recognition
- **Face Management**: Easy upload and deletion of registered faces
- **Modern UI**: Responsive design with Bootstrap 5 and custom styling
- **RESTful API**: Clean API endpoints for all operations
- **Statistics Dashboard**: Real-time statistics and status monitoring
- **Mobile Responsive**: Works seamlessly on desktop and mobile devices

## Technology Stack

- **Backend**: Flask (Python)
- **Computer Vision**: OpenCV, face_recognition
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **UI Framework**: Bootstrap 5
- **Deployment**: Render (Production ready)

## Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd face-recognition-app
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**
   ```bash
   python app.py
   ```

4. **Access the application**
   Open your browser and navigate to `http://localhost:5000`

## Deployment on Render

1. **Connect your repository** to Render
2. **Create a new Web Service**
3. **Use the following settings**:
   - **Environment**: Python
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app`
   - **Python Version**: 3.10.0

The `render.yaml` file is included for automatic configuration.

## API Endpoints

- `GET /` - Main application page
- `POST /api/process-frame` - Process video frame for face recognition
- `POST /api/upload-face` - Upload and register a new face
- `GET /api/faces` - Get list of registered faces
- `DELETE /api/delete-face` - Delete a registered face

## Usage

1. **Allow camera access** when prompted
2. **Add faces** by providing a name and uploading a clear photo
3. **View real-time recognition** in the video feed
4. **Manage faces** using the control panel on the right

## Security Features

- File type validation
- Secure filename handling
- Error handling and validation
- CORS protection

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 11+
- Edge 79+

## Performance Optimizations

- Frame processing throttling
- Image compression
- Efficient face encoding storage
- Responsive image loading

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is open source and available under the MIT License.