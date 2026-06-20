import os
from flask import Blueprint, request, jsonify, session, send_file, current_app
from utils.helpers import safe_name
# Import your builders from the utility file where you pasted them
from utils.doc_builders import DOC_TEMPLATES, BUILDERS

doc_maker_bp = Blueprint('doc_maker', __name__, url_prefix='/api/document-maker')

@doc_maker_bp.route('/types', methods=['GET'])
def doc_maker_types():
    formats = ['docx', 'pdf', 'xlsx', 'pptx', 'txt', 'md']
    return jsonify({'success': True, 'types': DOC_TEMPLATES, 'formats': formats})

@doc_maker_bp.route('/generate', methods=['POST'])
def doc_maker_generate():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    payload = request.json or {}
    doc_type = payload.get('doc_type', 'custom')
    fmt = (payload.get('format') or 'pdf').lower()
    data = payload.get('data') or {}
    
    if fmt not in BUILDERS:
        return jsonify({'success': False, 'error': f'Unsupported format: {fmt}'}), 400
    if doc_type not in DOC_TEMPLATES:
        return jsonify({'success': False, 'error': 'Unknown document type'}), 400

    builder, mime = BUILDERS[fmt]
    base = safe_name(data.get('title') or DOC_TEMPLATES[doc_type]['label'])
    out_name = f"{base}.{fmt}"
    out_path = os.path.join(current_app.config['UPLOAD_FOLDER'], out_name)
    
    try:
        builder(doc_type, data, out_path)
    except Exception as e:
        return jsonify({'success': False, 'error': f'Generation failed: {e}'}), 500

    return send_file(out_path, mimetype=mime, as_attachment=True, download_name=out_name)