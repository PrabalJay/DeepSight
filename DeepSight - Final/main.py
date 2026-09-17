import os

from ai_engine.app import app


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("AI_PORT", "5001")), debug=True)
