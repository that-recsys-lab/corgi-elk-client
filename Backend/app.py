from flask import Flask, request, jsonify
from flask_cors import CORS
from flask import make_response
import psycopg2
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
import logging
import json
import hashlib
import os

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, supports_credentials=True)

# PostgreSQL configuration
DB_CONFIG = {
    'dbname': os.getenv('DB_NAME', 'interactions_db'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),  # Use '' as default only for local dev
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432')
}

# Simple connection pool
pool = SimpleConnectionPool(minconn=1, maxconn=10, **DB_CONFIG)

@contextmanager
def get_db_connection():
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)

# Secure hashing for user pseudonymization
SALT = os.getenv("USER_HASH_SALT", "default_secret_salt")

def generate_user_alias(user_id):
    """Hash user ID for pseudonymization."""
    return hashlib.sha256((user_id + SALT).encode()).hexdigest()

# Database initialization
def init_db():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Create the interactions table
            cur.execute('''
                CREATE TABLE IF NOT EXISTS interactions (
                    id SERIAL PRIMARY KEY,
                    user_alias TEXT NOT NULL,
                    post_id TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    context JSONB DEFAULT '{}'::jsonb,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unique_user_post_action UNIQUE (user_alias, post_id, action_type)
                );
                CREATE INDEX IF NOT EXISTS idx_interactions_context ON interactions USING GIN (context);
            ''')
            
            # Create the privacy_settings table
            cur.execute('''
                CREATE TABLE IF NOT EXISTS privacy_settings (
                    user_id TEXT PRIMARY KEY,
                    tracking_level TEXT CHECK (tracking_level IN ('full', 'limited', 'none')) DEFAULT 'full'
                );
            ''')
        conn.commit()

@app.route('/')
def home():
    return 'ITS ALIVE'

# Health check endpoint
@app.route('/health')
def health_check():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT 1')  # Simple query to verify database connectivity
                return jsonify({"status": "healthy"})
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

@app.route('/interactions', methods=['POST'])
def log_interaction():
    logger.info('Received request to /interactions')

    try:
        data = request.json
        logger.info('Parsed JSON data: %s', data)

        user_id = data.get('user_id')
        post_id = data.get('post_id')
        action_type = data.get('action_type')
        context = data.get('context', {})

        if not all([user_id, post_id, action_type]):
            logger.warning('Missing required fields')
            return jsonify({"error": "Missing required fields"}), 400

        user_alias = generate_user_alias(user_id)

        # Normalize action types to match Elk UI
        ACTION_TYPE_MAPPING = {
            "favourited": "favorite",
            "favourite": "favorite",
            "unfavourite": "unfavorite",
            "bookmarked": "bookmark"
        }
        action_type = ACTION_TYPE_MAPPING.get(action_type, action_type)

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Check for conflicting interaction (binary logic)
                conflicting_action = "more_like_this" if action_type == "less_like_this" else "less_like_this"
                cur.execute('''
                    DELETE FROM interactions 
                    WHERE user_alias = %s AND post_id = %s AND action_type = %s
                ''', (user_alias, post_id, conflicting_action))
                
                # Insert or update the new interaction
                cur.execute('''
                    INSERT INTO interactions 
                    (user_alias, post_id, action_type, context)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (user_alias, post_id, action_type) 
                    DO UPDATE SET 
                        context = EXCLUDED.context,
                        created_at = CURRENT_TIMESTAMP
                    RETURNING id
                ''', (user_alias, post_id, action_type, json.dumps(context)))

                result = cur.fetchone()
                conn.commit()

                return jsonify({
                    "message": "Interaction logged successfully",
                    "id": result[0]
                }), 201

    except Exception as e:
        logger.error('Error: %s', str(e))
        return jsonify({"error": str(e)}), 500

@app.route('/interactions/<post_id>', methods=['GET'])
def get_interactions_by_post(post_id):
    """Return all interactions for a specific post."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('''
                    SELECT user_alias, action_type, context, created_at
                    FROM interactions
                    WHERE post_id = %s
                ''', (post_id,))
                
                interactions = cur.fetchall()

        if not interactions:
            return jsonify({"message": "No interactions found"}), 404

        return jsonify({
            "post_id": post_id,
            "interactions": [
                {
                    "user_alias": row[0],
                    "action_type": row[1],
                    "context": row[2],
                    "created_at": row[3].isoformat()
                } for row in interactions
            ]
        })

    except Exception as e:
        logger.error("Error fetching interactions: %s", str(e))
        return jsonify({"error": str(e)}), 500

@app.route('/user_data/<user_id>', methods=['GET'])
def get_user_data(user_id):
    """Retrieve all stored data for a specific user."""
    try:
        user_alias = generate_user_alias(user_id)

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('''
                    SELECT post_id, action_type, context, created_at
                    FROM interactions
                    WHERE user_alias = %s
                ''', (user_alias,))
                
                user_data = cur.fetchall()

        if not user_data:
            return jsonify({"message": "No data found for this user"}), 404

        return jsonify({
            "user_id": user_id,
            "interactions": [
                {
                    "post_id": row[0],
                    "action_type": row[1],
                    "context": row[2],
                    "created_at": row[3].isoformat()
                } for row in user_data
            ]
        })

    except Exception as e:
        logger.error("Error fetching user data: %s", str(e))
        return jsonify({"error": str(e)}), 500

@app.route('/interactions/favourites', methods=['GET'])
def get_favourites():
    """Return all posts the user has favorited."""
    user_id = request.args.get('user_id')

    if not user_id:
        return jsonify({"error": "Missing user_id"}), 400

    user_alias = generate_user_alias(user_id)

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('''
                    SELECT post_id, created_at
                    FROM interactions
                    WHERE user_alias = %s AND action_type = 'favorite'
                ''', (user_alias,))

                favourites = cur.fetchall()

        if not favourites:
            return jsonify({"message": "No favourites found"}), 404

        return jsonify({
            "user_id": user_id,
            "favourites": [
                {"post_id": row[0], "created_at": row[1].isoformat()}
                for row in favourites
            ]
        })

    except Exception as e:
        logger.error("Error fetching favourites: %s", str(e))
        return jsonify({"error": str(e)}), 500


@app.route('/interactions/analytics', methods=['GET'])
def get_analytics():
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('''
                    SELECT action_type, COUNT(*) 
                    FROM interactions 
                    WHERE context->>'feed_id' = %s 
                    GROUP BY action_type
                ''', (request.args.get('feed_id'),))
                
                results = cur.fetchall()
                return jsonify({
                    "feed_id": request.args.get('feed_id'),
                    "stats": dict(results)
                })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    init_db()  # Initialize the database tables
    app.run(debug=True, port=5001)

