import os
import datetime
from flask import Blueprint, request, jsonify, session, current_app
from werkzeug.utils import secure_filename
from utils.helpers import allowed_file, read_file_content
from database import (
    save_analyzed_document, list_analyzed_documents, 
    get_analyzed_document, delete_analyzed_document
)

doc_analyzer_bp = Blueprint('doc_analyzer', __name__, url_prefix='/api')

@doc_analyzer_bp.route('/upload-document', methods=['POST'])
def upload_document():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400
        
    f = request.files['file']
    if not f.filename or not allowed_file(f.filename):
        return jsonify({'success': False, 'error': 'Invalid file type. Allowed: txt, pdf, doc, docx'}), 400
        
    fn = secure_filename(f.filename)
    fp = os.path.join(current_app.config['UPLOAD_FOLDER'], fn)
    f.save(fp)
    
    try:
        content = read_file_content(fp)
    finally:
        try: os.remove(fp)
        except Exception: pass

    client = current_app.config['OPENAI_CLIENT']
    model_name = current_app.config['GEMINI_MODEL']

    # Generate Summary
    summary_resp = client.chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": f"Summarise this document concisely in 4-6 sentences:\n\n{content[:8000]}"}]
    )
    summary = summary_resp.choices[0].message.content.strip()

    # Extract Topics
    topics_resp = client.chat.completions.create(
        model=model_name,
        messages=[{"role": "user", "content": f"Extract 3-5 short topic labels (comma-separated, no numbering) from this summary:\n\n{summary}"}]
    )
    topics = topics_resp.choices[0].message.content.strip()

    display_name = (request.form.get('name') or '').strip() or fn
    doc_id = save_analyzed_document(session['user_id'], fn, display_name, summary, topics, content)

    return jsonify({
        'success': True, 'id': doc_id, 'summary': summary, 'topics': topics,
        'filename': fn, 'display_name': display_name, 'content': content
    })

@doc_analyzer_bp.route('/document-chat', methods=['POST'])
def document_chat():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
        
    d = request.json or {}
    msg = (d.get('message') or '').strip()
    if not msg:
        return jsonify({'success': False, 'error': 'Message cannot be empty'}), 400

    document_summary = d.get('document_summary', '')
    document_content = (d.get('document_content', '') or '')[:12000]

    client = current_app.config['OPENAI_CLIENT']
    model_name = current_app.config['GEMINI_MODEL']

    # --- ARCHITECTURE STEP 1: HYBRID FORCED KEYWORD ROUTER ---
    lowered_msg = msg.lower()
    time_keywords = ['now', 'current', 'latest', 'yesterday', 'today', 'ruling party', 'who is', 'election']
    
    # Check if keywords match first
    needs_web = any(kw in lowered_msg for kw in time_keywords)

    if not needs_web:
        # Fall back to asking the LLM if the document text is missing this info
        current_year = datetime.datetime.now().year
        router_prompt = f"""You are a document scanner coordinator. The current year is {current_year}.
Evaluate if the USER QUESTION addresses current facts, news, or basic out-of-document general knowledge completely absent from the provided document context.

DOCUMENT CONTENT:
{document_content}

USER QUESTION: {msg}

Respond with exactly one word: "YES" if it requires an external web search, or "NO" if the document already explicitly answers this question."""
        try:
            router_resp = client.chat.completions.create(
                model=model_name,
                messages=[{"role": "user", "content": router_prompt}],
                temperature=0.0
            )
            needs_web = "YES" in router_resp.choices[0].message.content.strip().upper()
        except Exception:
            needs_web = False

    # --- ARCHITECTURE STEP 2: LIVE WEB SEARCH EXECUTOR ---
    search_context = ""
    if needs_web:
        try:
            from utils.search_tool import web_search
            search_context = web_search(msg)
        except Exception as e:
            search_context = f"Note: Web search attempted but failed: {str(e)}"

    # --- ARCHITECTURE STEP 3: CONSOLIDATED PROMPT CONTEXT ---
    prompt = f"""You are a helpful document assistant. 

PRIMARY DOCUMENT CONTENT:
{document_content}"""

    if needs_web and search_context:
        prompt += f"""

EXTERNAL REAL-TIME SEARCH RESULTS (Use this to answer details completely missing from the document):
{search_context}"""

    prompt += f"""

USER QUESTION: {msg}

Instructions for your response:
- If the answer is completely missing from the document but found in the EXTERNAL REAL-TIME SEARCH RESULTS, use the web data to formulate an accurate answer. Inform the user that the primary document did not contain this information, so you pulled it live from the internet."""

    # --- ARCHITECTURE STEP 4: FINAL RECONCILIATION ---
    try:
        resp = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}]
        )
        answer = resp.choices[0].message.content.strip()
        return jsonify({"success": True, "response": answer})
    except Exception as e:
        return jsonify({"success": False, "error": f"Failed to generate answer: {str(e)}"}), 500

@doc_analyzer_bp.route('/documents', methods=['GET'])
def list_documents():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    return jsonify({'success': True, 'documents': list_analyzed_documents(session['user_id'])})

@doc_analyzer_bp.route('/documents/<int:doc_id>', methods=['GET'])
def fetch_document(doc_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    doc = get_analyzed_document(session['user_id'], doc_id)
    if not doc:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    return jsonify({'success': True, 'document': doc})

@doc_analyzer_bp.route('/documents/<int:doc_id>/delete', methods=['POST'])
def remove_document(doc_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    if delete_analyzed_document(session['user_id'], doc_id):
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Not found'}), 404