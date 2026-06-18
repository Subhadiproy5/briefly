import sqlite3
import os
import hashlib
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'chat_app.db')

def get_db():
    """Get database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with tables"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            email TEXT UNIQUE,
            mobile TEXT,
            dob TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Add new columns if they don't exist (for existing databases)
    cursor.execute("PRAGMA table_info(users)")
    columns = [column[1] for column in cursor.fetchall()]
    
    if 'name' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN name TEXT')
    if 'email' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN email TEXT')
    if 'mobile' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN mobile TEXT')
    if 'dob' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN dob TEXT')
    
    # Conversations table - check if it needs migration
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='conversations'")
    table_sql = cursor.fetchone()
    
    if table_sql and 'FOREIGN KEY' in table_sql[0]:
        # Drop old table with foreign key constraint
        cursor.execute('DROP TABLE IF EXISTS conversations')
        cursor.execute('DROP TABLE IF EXISTS messages')  # Also drop messages as it references conversations
    
    # Recreate conversations table without foreign key
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Messages table - check if it needs migration
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'")
    table_sql = cursor.fetchone()
    
    if table_sql and 'FOREIGN KEY' in table_sql[0]:
        # Drop old table with foreign key constraint
        cursor.execute('DROP TABLE IF EXISTS messages')
    
    # Recreate messages table without foreign key
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

def hash_password(password):
    """Hash password"""
    return hashlib.sha256(password.encode()).hexdigest()

def register_user(username, password, name=None, email=None):
    """Register a new user"""
    try:
        conn = get_db()
        cursor = conn.cursor()
        password_hash = hash_password(password)
        
        cursor.execute(
            'INSERT INTO users (username, password_hash, name, email) VALUES (?, ?, ?, ?)',
            (username, password_hash, name, email)
        )
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        return False

def login_user(username, password):
    """Verify user credentials"""
    conn = get_db()
    cursor = conn.cursor()
    password_hash = hash_password(password)
    
    cursor.execute(
        'SELECT id FROM users WHERE username = ? AND password_hash = ?',
        (username, password_hash)
    )
    user = cursor.fetchone()
    conn.close()
    
    return user['id'] if user else None

def create_conversation(user_id, title=None):
    """Create a new conversation"""
    conn = get_db()
    cursor = conn.cursor()
    
    if not title:
        title = f"Chat {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    
    cursor.execute(
        'INSERT INTO conversations (user_id, title) VALUES (?, ?)',
        (user_id, title)
    )
    conn.commit()
    conversation_id = cursor.lastrowid
    conn.close()
    
    return conversation_id

def get_user_conversations(user_id):
    """Get all conversations for a user"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        'SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY created_at DESC',
        (user_id,)
    )
    conversations = cursor.fetchall()
    conn.close()
    
    return [dict(c) for c in conversations]

def get_conversation_messages(conversation_id):
    """Get all messages in a conversation"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at',
        (conversation_id,)
    )
    messages = cursor.fetchall()
    conn.close()
    
    return [dict(m) for m in messages]

def save_message(conversation_id, role, content):
    """Save a message to a conversation"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
        (conversation_id, role, content)
    )
    
    # Update conversation's updated_at timestamp
    cursor.execute(
        'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        (conversation_id,)
    )
    
    conn.commit()
    conn.close()

def delete_conversation(conversation_id):
    """Delete a conversation and its messages"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Delete messages first
    cursor.execute('DELETE FROM messages WHERE conversation_id = ?', (conversation_id,))
    # Then delete the conversation
    cursor.execute('DELETE FROM conversations WHERE id = ?', (conversation_id,))
    conn.commit()
    conn.close()

def get_user_profile(user_id):
    """Get user profile information"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        'SELECT id, username, name, email, mobile, dob FROM users WHERE id = ?',
        (user_id,)
    )
    user = cursor.fetchone()
    conn.close()
    
    return dict(user) if user else None

def update_user_profile(user_id, name=None, mobile=None, dob=None):
    """Update user profile"""
    conn = get_db()
    cursor = conn.cursor()
    
    updates = []
    params = []
    
    if name is not None:
        updates.append('name = ?')
        params.append(name)
    if mobile is not None:
        updates.append('mobile = ?')
        params.append(mobile)
    if dob is not None:
        updates.append('dob = ?')
        params.append(dob)
    
    if updates:
        params.append(user_id)
        cursor.execute(
            f'UPDATE users SET {", ".join(updates)} WHERE id = ?',
            params
        )
        conn.commit()
    
    conn.close()
    return True

def change_password(user_id, new_password):
    """Change user password"""
    conn = get_db()
    cursor = conn.cursor()
    password_hash = hash_password(new_password)
    
    cursor.execute(
        'UPDATE users SET password_hash = ? WHERE id = ?',
        (password_hash, user_id)
    )
    conn.commit()
    conn.close()
    return True
