#!/usr/bin/env python3
import psycopg2
import json
import re
from datetime import datetime, timedelta

# Database configuration
DB_CONFIG = {
    'dbname': 'posts_db',
    'user': 'postgres',
    'password': '',
    'host': 'localhost',
    'port': '5432'
}

# Connect to the database
conn = psycopg2.connect(**DB_CONFIG)
cur = conn.cursor()

# Helper function to clean HTML content
def clean_html(content):
    if not content:
        return content
    # Remove HTML tags
    content = re.sub(r'<[^>]+>', ' ', content)
    # Replace multiple spaces with a single space
    content = re.sub(r'\s+', ' ', content)
    return content.strip()

# Get posts from the last 15 minutes to see real-time logging
fifteen_minutes_ago = datetime.now() - timedelta(minutes=15)

print(f"\n=== POSTS LOGGED IN THE LAST 15 MINUTES ===")
print(f"(since {fifteen_minutes_ago.strftime('%H:%M:%S')})")

cur.execute("""
SELECT post_id, author_name, content_type, created_at, interaction_counts
FROM post_metadata 
WHERE created_local_at > %s
ORDER BY created_local_at DESC
""", (fifteen_minutes_ago,))

recent_posts = cur.fetchall()

if not recent_posts:
    print("\nNo posts found in the last 15 minutes.")
    
    # Show most recent posts anyway
    print("\n=== MOST RECENT 5 POSTS ===")
    cur.execute("""
    SELECT post_id, author_name, content_type, created_at, interaction_counts
    FROM post_metadata 
    ORDER BY created_local_at DESC
    LIMIT 5
    """)
    recent_posts = cur.fetchall()

# Display posts
for post in recent_posts:
    post_id = post[0]
    author = post[1] if post[1] else "Unknown"
    content_type = post[2] if post[2] else "text"
    created_at = post[3]
    
    # Parse interaction counts
    counts = post[4] if post[4] else {}
    favorites = counts.get('favorites', 0)
    reblogs = counts.get('reblogs', 0)
    replies = counts.get('replies', 0)
    
    print(f"\nPOST: {post_id}")
    print(f"AUTHOR: {author}")
    print(f"TYPE: {content_type}")
    print(f"CREATED: {created_at}")
    print(f"STATS: ❤️ {favorites} | 🔄 {reblogs} | 💬 {replies}")
    
# Close the connection
conn.close()