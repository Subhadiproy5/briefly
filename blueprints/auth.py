import os
from flask import Blueprint, request, jsonify, session
from utils.helpers import verify_recaptcha
from database import (
    register_user, login_user, get_user_profile, 
    update_user_profile, change_password
)

auth_bp = Blueprint('auth', __name__, url_prefix='/api')

@auth_bp.route('/config')
def api_config():
    return jsonify({'recaptcha_site_key': os.getenv('RECAPTCHA_SITE_KEY', '')})

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.json or {}
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    password = (data.get('password') or '').strip()
    
    if not email or not password:
        return jsonify({'success': False, 'error': 'Email and password required'}), 400
    if len(password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400
    if not verify_recaptcha(data.get('recaptcha_response')):
        return jsonify({'success': False, 'error': 'reCAPTCHA verification failed'}), 400
    if register_user(email, password, name, email):
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Email already exists'}), 400

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.json or {}
    username = (data.get('username') or '').strip()
    password = (data.get('password') or '').strip()
    
    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400
    if not verify_recaptcha(data.get('recaptcha_response')):
        return jsonify({'success': False, 'error': 'reCAPTCHA verification failed'}), 400
        
    user_id = login_user(username, password)
    if user_id:
        session['user_id'] = user_id
        session['username'] = username
        return jsonify({'success': True})
    return jsonify({'success': False, 'error': 'Invalid credentials'}), 401

@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True})

@auth_bp.route('/user', methods=['GET'])
def get_user():
    if 'user_id' in session:
        return jsonify({'success': True, 'user_id': session['user_id'],
                        'username': session['username'],
                        'profile': get_user_profile(session['user_id'])})
    return jsonify({'success': False, 'error': 'Not logged in'}), 401

@auth_bp.route('/profile/update', methods=['POST'])
def update_profile():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    d = request.json or {}
    update_user_profile(session['user_id'], d.get('name'), d.get('mobile'), d.get('dob'))
    return jsonify({'success': True})

@auth_bp.route('/profile/change-password', methods=['POST'])
def change_password_endpoint():
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 401
    d = request.json or {}
    cur_pwd = d.get('current_password') or ''
    new_pwd = d.get('new_password') or ''
    if not cur_pwd or not new_pwd:
        return jsonify({'success': False, 'error': 'Current and new password required'}), 400
    if not login_user(session['username'], cur_pwd):
        return jsonify({'success': False, 'error': 'Current password is incorrect'}), 400
    if len(new_pwd) < 6:
        return jsonify({'success': False, 'error': 'New password must be at least 6 characters'}), 400
    change_password(session['user_id'], new_pwd)
    return jsonify({'success': True})