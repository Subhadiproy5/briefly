from flask import Blueprint, request, jsonify, session, send_file
from io import BytesIO
from bs4 import BeautifulSoup
from utils.helpers import safe_name
# Import html exporters from utility file
from utils.html_exporters import _html_to_docx_bytes, _html_to_pdf_bytes
from database import (
    list_drafts, get_draft, create_draft, update_draft, delete_draft
)

editor_bp = Blueprint('editor', __name__, url_prefix='/api/editor')

@editor_bp.route('/drafts', methods=['GET'])
def api_drafts_list():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    kind = request.args.get('kind')
    return jsonify({'success': True, 'drafts': list_drafts(session['user_id'], kind)})

@editor_bp.route('/drafts', methods=['POST'])
def api_drafts_create():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    d = request.json or {}
    kind = d.get('kind')
    if kind not in ('text', 'sheet'):
        return jsonify({'success': False, 'error': 'kind must be text or sheet'}), 400
    title = (d.get('title') or 'Untitled').strip()
    content = d.get('content') or ''
    did = create_draft(session['user_id'], kind, title, content)
    return jsonify({'success': True, 'id': did})

@editor_bp.route('/drafts/<int:draft_id>', methods=['GET'])
def api_drafts_get(draft_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    draft = get_draft(session['user_id'], draft_id)
    if not draft:
        return jsonify({'success': False, 'error': 'Not found'}), 404
    return jsonify({'success': True, 'draft': draft})

@editor_bp.route('/drafts/<int:draft_id>', methods=['PUT'])
def api_drafts_update(draft_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    d = request.json or {}
    ok = update_draft(session['user_id'], draft_id, d.get('title'), d.get('content'))
    if not ok: 
        return jsonify({'success': False, 'error': 'Not found'}), 404
    return jsonify({'success': True})

@editor_bp.route('/drafts/<int:draft_id>/delete', methods=['POST'])
def api_drafts_delete(draft_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    if delete_draft(session['user_id'], draft_id):
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Not found'}), 404

@editor_bp.route('/export/text', methods=['POST'])
def api_editor_export_text():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    d = request.json or {}
    fmt = (d.get('format') or 'pdf').lower()
    title = safe_name(d.get('title') or 'document')
    html = d.get('html') or ''
    try:
        if fmt in ('docx', 'doc'):
            buf = _html_to_docx_bytes(html, title)
            mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' if fmt == 'docx' else 'application/msword'
            return send_file(buf, mimetype=mime, as_attachment=True, download_name=f'{title}.{fmt}')
        if fmt == 'pdf':
            buf = _html_to_pdf_bytes(html, title)
            return send_file(buf, mimetype='application/pdf', as_attachment=True, download_name=f'{title}.pdf')
        if fmt == 'txt':
            text = BeautifulSoup(html, 'html.parser').get_text(separator='\n')
            buf = BytesIO(text.encode('utf-8'))
            return send_file(buf, mimetype='text/plain', as_attachment=True, download_name=f'{title}.txt')
        return jsonify({'success': False, 'error': f'Unsupported format: {fmt}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Export failed: {e}'}), 500

@editor_bp.route('/export/sheet', methods=['POST'])
def api_editor_export_sheet():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    payload = request.json or {}
    fmt = (payload.get('format') or 'xlsx').lower()
    title = safe_name(payload.get('title') or 'spreadsheet')
    rows = payload.get('rows') or []
    try:
        if fmt == 'csv':
            import csv, io
            s = io.StringIO()
            w = csv.writer(s)
            for row in rows:
                w.writerow(row if isinstance(row, list) else [row])
            buf = BytesIO(s.getvalue().encode('utf-8'))
            return send_file(buf, mimetype='text/csv', as_attachment=True, download_name=f'{title}.csv')
        if fmt == 'xlsx':
            from openpyxl import Workbook
            wb = Workbook()
            ws = wb.active
            ws.title = title[:30] or 'Sheet1'
            for ri, row in enumerate(rows, 1):
                for ci, val in enumerate(row, 1):
                    try:
                        v = float(val)
                        if v.is_integer(): v = int(v)
                    except (TypeError, ValueError):
                        v = val
                    ws.cell(row=ri, column=ci, value=v)
            buf = BytesIO()
            wb.save(buf)
            buf.seek(0)
            return send_file(buf, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                             as_attachment=True, download_name=f'{title}.xlsx')
        return jsonify({'success': False, 'error': f'Unsupported format: {fmt}'}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': f'Export failed: {e}'}), 500