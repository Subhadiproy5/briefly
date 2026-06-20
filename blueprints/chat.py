import json
import datetime as dt
from flask import Blueprint, request, jsonify, session, Response, stream_with_context, current_app
from utils.helpers import simple_responses
from database import (
    create_conversation, get_user_conversations, 
    get_conversation_messages, save_message, delete_conversation, get_db
)

chat_bp = Blueprint('chat', __name__, url_prefix='/api')

@chat_bp.route('/conversations', methods=['GET'])
def get_conversations():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    return jsonify({'success': True, 'conversations': get_user_conversations(session['user_id'])})

@chat_bp.route('/conversations/new', methods=['POST'])
def new_conversation():
    data = request.json or {}
    title = data.get('title') or 'New Chat'
    user_id = session.get('user_id', 0)
    cid = create_conversation(user_id, title)
    return jsonify({'success': True, 'conversation_id': cid})

@chat_bp.route('/conversations/<int:cid>/messages', methods=['GET'])
def get_messages(cid):
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT user_id FROM conversations WHERE id = ?', (cid,))
    row = cur.fetchone()
    conn.close()
    if not row or row[0] != session['user_id']:
        return jsonify({'success': False, 'error': 'Access denied'}), 403
    return jsonify({'success': True, 'messages': get_conversation_messages(cid)})

@chat_bp.route('/conversations/<int:cid>/delete', methods=['POST'])
def delete_conv(cid):
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    conn = get_db()
    cur = conn.cursor()
    cur.execute('SELECT user_id FROM conversations WHERE id = ?', (cid,))
    row = cur.fetchone()
    conn.close()
    if not row or row[0] != session['user_id']:
        return jsonify({'success': False, 'error': 'Access denied'}), 403
    delete_conversation(cid)
    return jsonify({'success': True})

@chat_bp.route('/chat', methods=['POST'])
def chat():
    # Fetch global instances stored on the current app context
    rag_system = current_app.config['RAG_SYSTEM']
    
    data = request.json or {}
    user_message = (data.get('message') or '').strip()
    conversation_id = data.get('conversation_id')
    if not user_message:
        return jsonify({'success': False, 'error': 'Message cannot be empty'}), 400

    if not conversation_id:
        user_id = session.get('user_id', 0)
        title = user_message[:50] + ('...' if len(user_message) > 50 else '')
        conversation_id = create_conversation(user_id, title)

    if 'user_id' in session:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT user_id FROM conversations WHERE id = ?', (conversation_id,))
        row = cur.fetchone()
        conn.close()
        if row and row[0] != session['user_id'] and row[0] != 0:
            return jsonify({'success': False, 'error': 'Access denied'}), 403

    lower = user_message.lower().strip()
    if lower in simple_responses:
        reply = simple_responses[lower]
    else:
        previous = get_conversation_messages(conversation_id)
        reply = rag_system.generate_response_with_rag(user_message, previous)

    save_message(conversation_id, 'user', user_message)
    save_message(conversation_id, 'assistant', reply)
    return jsonify({'success': True, 'message': reply, 'conversation_id': conversation_id})

@chat_bp.route('/chat/stream', methods=['POST'])
def chat_stream():
    client = current_app.config['OPENAI_CLIENT']
    model_name = current_app.config['GEMINI_MODEL']
    
    data = request.json or {}
    user_message = (data.get('message') or '').strip()
    conversation_id = data.get('conversation_id')
    if not user_message:
        return jsonify({'success': False, 'error': 'Message cannot be empty'}), 400

    if not conversation_id:
        user_id = session.get('user_id', 0)
        title = user_message[:50] + ('...' if len(user_message) > 50 else '')
        conversation_id = create_conversation(user_id, title)

    if 'user_id' in session:
        conn = get_db()
        cur = conn.cursor()
        cur.execute('SELECT user_id FROM conversations WHERE id = ?', (conversation_id,))
        row = cur.fetchone()
        conn.close()
        if row and row[0] != session['user_id'] and row[0] != 0:
            return jsonify({'success': False, 'error': 'Access denied'}), 403

    save_message(conversation_id, 'user', user_message)
    lower = user_message.lower().strip()
    simple = simple_responses.get(lower)

    def event_stream():
        meta = {'conversation_id': conversation_id, 'created_at': dt.datetime.utcnow().isoformat() + 'Z'}
        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"

        full_reply = ''
        try:
            if simple:
                full_reply = simple
                for ch in simple:
                    yield f"data: {json.dumps({'delta': ch})}\n\n"
            else:
                previous = get_conversation_messages(conversation_id)
                history_lines = []
                for m in previous[-10:-1]:
                    tag = 'User' if m['role'] == 'user' else 'Assistant'
                    history_lines.append(f"{tag}: {m['content']}")
                history_text = '\n'.join(history_lines)
                
                # --- NEW LIVE WEB ROUTER INTEGRATION ---
                rag_system = current_app.config['RAG_SYSTEM']
                if rag_system._needs_web_search(user_message):
                    from utils.search_tool import web_search
                    live_context = web_search(user_message)
                    processed_user_message = f"{live_context}\n\nUser Question: {user_message}"
                else:
                    processed_user_message = user_message
                # ----------------------------------------

                prompt = (
                    "You are Briefly, a helpful, concise and friendly AI assistant. "
                    "Use markdown formatting when useful (headings, lists, **bold**, `code`).\n\n"
                )
                if history_text:
                    prompt += f"Conversation so far:\n{history_text}\n\n"
                prompt += f"User: {processed_user_message}\nAssistant:"

                stream = client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": "You are Briefly, a helpful assistant."},
                        {"role": "user", "content": prompt}
                    ],
                    stream=True,
                )
                for chunk in stream:
                    if chunk.choices:
                        delta = chunk.choices[0].delta.content
                        if delta:
                            full_reply += delta
                            yield f"data: {json.dumps({'delta': delta})}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
            return

        if full_reply:
            save_message(conversation_id, 'assistant', full_reply)
        yield f"event: done\ndata: {json.dumps({'full': full_reply, 'created_at': dt.datetime.utcnow().isoformat() + 'Z'})}\n\n"

    return Response(stream_with_context(event_stream()),
                    mimetype='text/event-stream',
                    headers={
                        'Cache-Control': 'no-cache, no-transform',
                        'X-Accel-Buffering': 'no',
                        'Connection': 'keep-alive',
                    })