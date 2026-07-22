# Deep Sight Backend

State-of-the-Art Deepfake Detection System Backend.

## Setup

1. Create a virtual environment: `python -m venv venv`
2. Activate the virtual environment:
   - Windows: `venv\Scripts\activate`
   - Linux/Mac: `source venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`

## Running

Start the server:
```bash
uvicorn main:app --reload
```

Access the interactive API documentation at `http://localhost:8000/docs`.
