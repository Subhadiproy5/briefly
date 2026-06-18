"""ASGI wrapper so uvicorn can serve the Flask app on port 8001."""
from a2wsgi import WSGIMiddleware
from app_flask import app as flask_app

app = WSGIMiddleware(flask_app)
