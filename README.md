# DeepSight

DeepSight is a full-stack media analysis application for checking images and
videos with deepfake-detection models. Users can upload supported media,
receive an authenticity verdict and confidence score, and optionally save
scan history to an account.

## Main technologies

- **Frontend:** React 19, Vite 8
- **API server:** Node.js, Express, MongoDB/Mongoose
- **AI service:** Python, Flask, TensorFlow, PyTorch, Hugging Face Transformers,
  OpenCV, NumPy
- **Authentication:** bcryptjs and JSON Web Tokens

## Project structure

```text
.
├── ai_engine/                 # Flask AI service and media processing
│   ├── app.py
│   └── processor.py
├── client/                    # React/Vite frontend
│   ├── public/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── models/                    # Requires .h5 model artifacts
├── server/                    # Express API and authentication
│   ├── index.js
│   ├── package.json
│   ├── package-lock.json
│   └── test/
├── README.md
├── main.py
└── requirements.txt
```

## Local setup

### 1. Install Python dependencies

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

### 2. Install Node dependencies

```powershell
cd server
npm ci
cd ..\client
npm ci
cd ..
```

### 3. Start the services

Open three terminal windows from the project root:

```powershell
# Terminal 1: AI service on port 5001
python main.py
```

```powershell
# Terminal 2: API server on port 5000
cd server
npm run dev
```

```powershell
# Terminal 3: frontend on port 5173
cd client
npm run dev
```

Open the Vite URL shown in the frontend terminal, normally
`http://localhost:5173`.

For a deployed frontend, set `VITE_API_URL` to the deployed API URL before
building the client. The API must be able to reach the deployed AI service,
and `CORS_ORIGIN` must include the deployed frontend URL.

## Useful commands

```powershell
# Build and preview the frontend
cd client
npm run build
npm run preview

# Run API tests
cd ..\server
npm test
```

## Live application

**Live app:** `https://your-live-frontend-url.example.com`
