from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
import logging
import json
import os
import atexit
import time
from datetime import datetime
import traceback

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, supports_credentials=True, resources={r"/*": {"origins": "*"}})

# PostgreSQL configuration
DB_CONFIG = {
    'dbname': os.getenv('DB_NAME', 'posts_db'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', ''),  # Use '' as default only for local dev
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432')
}

# Create connection pool
try:
    pool = SimpleConnectionPool(minconn=1, maxconn=10, **DB_CONFIG)
    logger.info("Database connection pool established successfully")
    
    # Register a cleanup function to close all connections when the app exits
    @atexit.register
    def close_pool():
        if pool:
            pool.closeall()
            logger.info("Database connection pool closed")
except Exception as e:
    logger.error(f"Error establishing database connection: {e}")
    pool = None  # We'll handle this case in get_db_connection

@contextmanager
def get_db_connection():
    global pool
    if pool is None:
        # If pool initialization failed, try to reconnect
        try:
            pool = SimpleConnectionPool(minconn=1, maxconn=10, **DB_CONFIG)
            logger.info("Reconnected to database pool")
        except Exception as e:
            logger.error(f"Failed to reconnect to database: {e}")
            raise
    
    # Get connection from pool
    try:
        conn = pool.getconn()
        try:
            yield conn
        finally:
            pool.putconn(conn)
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise

# Database initialization
def init_db():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Create the post_metadata table if it doesn't exist
            cur.execute('''
                CREATE TABLE IF NOT EXISTS post_metadata (
                    post_id TEXT PRIMARY KEY,
                    author_id TEXT NOT NULL,
                    author_name TEXT,
                    content TEXT,
                    created_at TIMESTAMP WITH TIME ZONE,
                    interaction_counts JSONB DEFAULT '{}'::jsonb,
                    created_local_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Check if columns exist, add them if not
            for column_name in ['content_type', 'author_name']:
                cur.execute('''
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name = 'post_metadata' AND column_name = %s
                ''', (column_name,))
                if not cur.fetchone():
                    logger.info(f"Adding {column_name} column to post_metadata table")
                    cur.execute(f'ALTER TABLE post_metadata ADD COLUMN {column_name} TEXT')
            
            # Create indexes
            cur.execute('''
                CREATE INDEX IF NOT EXISTS idx_post_author ON post_metadata(author_id);
                CREATE INDEX IF NOT EXISTS idx_post_created_at ON post_metadata(created_at);
                CREATE INDEX IF NOT EXISTS idx_post_content_type ON post_metadata(content_type);
            ''')
        conn.commit()

@app.route('/')
def home():
    return 'Post Metadata Service'

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

@app.route('/posts', methods=['POST', 'OPTIONS'])
def save_post():
    # Handle preflight request
    if request.method == 'OPTIONS':
        return jsonify({"status": "ok"}), 200
        
    logger.info('Received request to save post metadata')

    try:
        # Add debug info about the request
        logger.info('Request headers: %s', request.headers)
        logger.info('Request data: %s', request.data)
        
        # Make sure we can parse the JSON data
        try:
            data = request.json
            logger.info('Parsed JSON data: %s', data)
        except Exception as e:
            logger.error('Failed to parse JSON: %s', str(e))
            logger.error('Request body: %s', request.data)
            return jsonify({"error": "Invalid JSON format"}), 400

        # Extract data from the request
        post_id = data.get('post_id')
        author_id = data.get('author_id')
        author_name = data.get('author_name')
        content = data.get('content')
        content_type = data.get('content_type', 'text')
        created_at = data.get('created_at')
        interaction_counts = data.get('interaction_counts', {})

        # Validate required fields
        if not all([post_id, author_id]):
            logger.warning('Missing required fields')
            return jsonify({"error": "Missing required fields (post_id and author_id required)"}), 400

        # Optional logging of successful parsing
        logger.info(f"Parsed data - post_id: {post_id}, author_id: {author_id}, created_at: {created_at}")
        
        # Retry logic for database operations
        max_retries = 3
        retry_delay = 1  # seconds
        
        for attempt in range(max_retries):
            try:
                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute('''
                            INSERT INTO post_metadata 
                            (post_id, author_id, author_name, content, content_type, created_at, interaction_counts)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (post_id) 
                            DO UPDATE SET 
                                content = EXCLUDED.content,
                                author_name = EXCLUDED.author_name,
                                content_type = EXCLUDED.content_type,
                                interaction_counts = EXCLUDED.interaction_counts
                            RETURNING post_id
                        ''', (post_id, author_id, author_name, content, content_type, created_at, json.dumps(interaction_counts)))

                        result = cur.fetchone()
                        conn.commit()
                        
                        logger.info(f"Successfully saved post {post_id}")
                        return jsonify({
                            "message": "Post metadata saved successfully",
                            "post_id": result[0]
                        }), 201
                        
            except psycopg2.Error as db_error:
                logger.error(f"Database error (attempt {attempt+1}/{max_retries}): {str(db_error)}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                else:
                    logger.error("Maximum retries reached. Database operation failed.")
                    return jsonify({"error": f"Database error: {str(db_error)}"}), 500

    except Exception as e:
        logger.error('Unexpected error: %s', str(e))
        logger.error('Traceback: %s', traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/posts/<post_id>', methods=['GET'])
def get_post(post_id):
    """Retrieve metadata for a specific post."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('''
                    SELECT post_id, author_id, author_name, content, content_type, created_at, interaction_counts
                    FROM post_metadata
                    WHERE post_id = %s
                ''', (post_id,))
                
                post_data = cur.fetchone()

        if not post_data:
            return jsonify({"message": "Post not found"}), 404

        return jsonify({
            "post_id": post_data[0],
            "author_id": post_data[1],
            "author_name": post_data[2],
            "content": post_data[3],
            "content_type": post_data[4],
            "created_at": post_data[5].isoformat() if post_data[5] else None,
            "interaction_counts": post_data[6]
        })

    except Exception as e:
        logger.error("Error fetching post data: %s", str(e))
        return jsonify({"error": str(e)}), 500

@app.route('/posts/author/<author_id>', methods=['GET'])
def get_posts_by_author(author_id):
    """Retrieve all posts by a specific author."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute('''
                    SELECT post_id, author_id, author_name, content, content_type, created_at, interaction_counts
                    FROM post_metadata
                    WHERE author_id = %s
                    ORDER BY created_at DESC
                ''', (author_id,))
                
                posts = cur.fetchall()

        if not posts:
            return jsonify({"message": "No posts found for this author"}), 404

        return jsonify({
            "author_id": author_id,
            "posts": [
                {
                    "post_id": row[0],
                    "author_id": row[1],
                    "author_name": row[2],
                    "content": row[3],
                    "content_type": row[4],
                    "created_at": row[5].isoformat() if row[5] else None,
                    "interaction_counts": row[6]
                } for row in posts
            ]
        })

    except Exception as e:
        logger.error("Error fetching author posts: %s", str(e))
        return jsonify({"error": str(e)}), 500

@app.route('/posts/trending', methods=['GET'])
def get_trending_posts():
    """Get posts with highest interaction counts."""
    limit = request.args.get('limit', default=10, type=int)
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Get posts with highest total interactions using jsonb functionality
                cur.execute('''
                    SELECT 
                        post_id, 
                        author_id, 
                        author_name,
                        content, 
                        content_type,
                        created_at, 
                        interaction_counts,
                        (
                            COALESCE((interaction_counts->>'favorites')::int, 0) + 
                            COALESCE((interaction_counts->>'reblogs')::int, 0) + 
                            COALESCE((interaction_counts->>'replies')::int, 0)
                        ) as total_interactions
                    FROM post_metadata
                    ORDER BY total_interactions DESC, created_at DESC
                    LIMIT %s
                ''', (limit,))
                
                trending_posts = cur.fetchall()

        return jsonify({
            "trending_posts": [
                {
                    "post_id": row[0],
                    "author_id": row[1],
                    "author_name": row[2],
                    "content": row[3],
                    "content_type": row[4],
                    "created_at": row[5].isoformat() if row[5] else None,
                    "interaction_counts": row[6],
                    "total_interactions": row[7]
                } for row in trending_posts
            ]
        })

    except Exception as e:
        logger.error("Error fetching trending posts: %s", str(e))
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    init_db()  # Initialize the database tables
    
    # Enable hot reloading and debug output
    app.run(
        debug=True,           # Auto-restart on code changes
        port=5002,
        use_reloader=True,    # Auto-reload when code changes
        threaded=True,        # Handle multiple requests concurrently
        host='0.0.0.0'        # Listen on all network interfaces
    )