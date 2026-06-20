import os
from flask import Flask, render_template, jsonify
from dotenv import load_dotenv
from openai import OpenAI

from database import init_db
from rag_system import RAGSystem

# Import Blueprints
from blueprints.auth import auth_bp
from blueprints.chat import chat_bp
from blueprints.doc_analyzer import doc_analyzer_bp
from blueprints.doc_maker import doc_maker_bp
from blueprints.editor import editor_bp
# (Make sure to import your other created blueprints here similarly)

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

def create_app():
    app = Flask(__name__, template_folder="templates")
    
    # App Configurations
    app.secret_key = os.getenv('SECRET_KEY', 'change-me')
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Initialize DB
    init_db()
    
    # Core Global Engines
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        raise ValueError('GEMINI_API_KEY missing in .env')
        
    model_name = os.getenv('GEMINI_MODEL', 'openai/gpt-oss-120b:free')
    app.config['GEMINI_MODEL'] = model_name
    
    openai_client = OpenAI(
        api_key=api_key,
        base_url="https://openrouter.ai/api/v1"
    )
    
    # Place operational engine items within config map for context visibility
    app.config['OPENAI_CLIENT'] = openai_client
    app.config['RAG_SYSTEM'] = RAGSystem(api_key, model_name)

    # Register Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(doc_analyzer_bp)
    app.register_blueprint(doc_maker_bp)
    app.register_blueprint(editor_bp)

    # Global base routes
    @app.route("/")
    def home():
        return render_template("index.html")

    @app.route('/api/health')
    def health():
        return jsonify({'success': True, 'status': 'ok', 'service': 'Briefly API Services'})

    return app

if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)