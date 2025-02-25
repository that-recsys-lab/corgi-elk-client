#!/usr/bin/env python3
import psycopg2
import json
import re
import argparse
import sys

"""
Database Cleanup Tool for Post Metadata

This script provides utilities to:
1. Display the current database structure and sample data
2. Clean up HTML and problematic content
3. Fix duplicate interaction counts
4. Remove test or incomplete posts
5. Export data as JSON
"""

# Database configuration
DB_CONFIG = {
    'dbname': 'posts_db',
    'user': 'postgres',
    'password': '',
    'host': 'localhost',
    'port': '5432'
}

# Connect to the database
def connect_db():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

# Display table structure
def show_structure():
    conn = connect_db()
    cur = conn.cursor()
    
    try:
        # Get column information
        cur.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'post_metadata'
        ORDER BY ordinal_position
        """)
        columns = cur.fetchall()
        
        print('=== TABLE STRUCTURE ===')
        for col in columns:
            print(f'{col[0]}: {col[1]}')
            
        # Count records
        cur.execute('SELECT COUNT(*) FROM post_metadata')
        count = cur.fetchone()[0]
        print(f'\nTotal records: {count}')
        
    except Exception as e:
        print(f"Error showing structure: {e}")
    finally:
        conn.close()

# Clean HTML content from a string
def clean_html(content):
    if not content:
        return content
    # Remove HTML tags
    content = re.sub(r'<[^>]+>', ' ', content)
    # Replace multiple spaces with a single space
    content = re.sub(r'\s+', ' ', content)
    return content.strip()

# Show sample data
def show_sample(limit=10):
    conn = connect_db()
    cur = conn.cursor()
    
    try:
        print('\n=== SAMPLE DATA ===')
        cur.execute(f'SELECT post_id, author_id, author_name, content, content_type, created_at, interaction_counts FROM post_metadata LIMIT {limit}')
        rows = cur.fetchall()
        
        for row in rows:
            post_id = row[0]
            author_id = row[1]
            author_name = row[2] if row[2] else "None"
            content = clean_html(row[3])
            content = (content[:100] + '...') if content and len(content) > 100 else content
            content_type = row[4] if row[4] else "None"
            created_at = row[5]
            
            # Parse interaction counts
            counts = {}
            if row[6]:
                counts = row[6]
                
            print(f'POST_ID: {post_id}')
            print(f'AUTHOR: {author_name} (ID: {author_id})')
            print(f'CONTENT: {content}')
            print(f'TYPE: {content_type}')
            print(f'CREATED: {created_at}')
            print(f'INTERACTIONS: ❤️ {counts.get("favorites", 0)} | 🔄 {counts.get("reblogs", 0)} | 💬 {counts.get("replies", 0)}')
            print('-' * 50)
            
    except Exception as e:
        print(f"Error showing sample: {e}")
    finally:
        conn.close()

# Fix duplicate digits in interaction counts
def fix_duplicate_counts():
    conn = connect_db()
    cur = conn.cursor()
    
    try:
        print('\n=== FIXING DUPLICATE INTERACTION COUNTS ===')
        # Get all posts
        cur.execute('SELECT post_id, interaction_counts FROM post_metadata')
        rows = cur.fetchall()
        
        fixed_count = 0
        
        for row in rows:
            post_id = row[0]
            counts = row[1]
            
            if not counts:
                continue
            
            original_counts = dict(counts)
            new_counts = dict(counts)
            modified = False
            
            # Check each count type for duplication
            for key in ['favorites', 'reblogs', 'replies']:
                if key in counts:
                    value = counts[key]
                    if not isinstance(value, int):
                        continue
                        
                    # Check for duplicate digits
                    str_val = str(value)
                    if len(str_val) >= 4 and len(str_val) % 2 == 0:
                        half = len(str_val) // 2
                        first_half = str_val[:half]
                        second_half = str_val[half:]
                        
                        if first_half == second_half:
                            # Found duplicate digits
                            new_counts[key] = int(first_half)
                            modified = True
            
            # If we found and fixed duplicates, update the database
            if modified:
                fixed_count += 1
                print(f"Fixing post {post_id}: {original_counts} → {new_counts}")
                
                # Update the database
                cur.execute(
                    'UPDATE post_metadata SET interaction_counts = %s WHERE post_id = %s',
                    (json.dumps(new_counts), post_id)
                )
        
        # Commit the changes
        conn.commit()
        print(f"\nFixed {fixed_count} posts with duplicate interaction counts")
        
    except Exception as e:
        conn.rollback()
        print(f"Error fixing duplicate counts: {e}")
    finally:
        conn.close()

# Clean up the database by removing test posts and entries with no real content
def clean_database():
    conn = connect_db()
    cur = conn.cursor()
    
    try:
        print('\n=== CLEANING DATABASE ===')
        
        # 1. Remove test posts
        cur.execute("DELETE FROM post_metadata WHERE post_id LIKE 'test-post-%' OR post_id LIKE 'test-%'")
        test_posts_removed = cur.rowcount
        
        # 2. Clean up posts without real content (just mentions or empty)
        cur.execute("DELETE FROM post_metadata WHERE content IS NULL OR content = '' OR content LIKE '%@%@%' AND LENGTH(content) < 50")
        empty_posts_removed = cur.rowcount
        
        # 3. Update author names where they're null but in the HTML content
        cur.execute("""
        UPDATE post_metadata 
        SET author_name = 'Unknown Poster'
        WHERE author_name IS NULL
        """)
        author_names_updated = cur.rowcount
        
        # Commit changes
        conn.commit()
        
        print(f"Removed {test_posts_removed} test posts")
        print(f"Removed {empty_posts_removed} empty/mention-only posts")
        print(f"Updated {author_names_updated} missing author names")
        
    except Exception as e:
        conn.rollback()
        print(f"Error cleaning database: {e}")
    finally:
        conn.close()

# Export database to JSON
def export_json(filename='post_data.json'):
    conn = connect_db()
    cur = conn.cursor()
    
    try:
        print(f'\n=== EXPORTING DATABASE TO {filename} ===')
        
        cur.execute("""
        SELECT post_id, author_id, author_name, content, content_type, 
               created_at, interaction_counts
        FROM post_metadata
        """)
        
        rows = cur.fetchall()
        
        # Convert to list of dicts
        result = []
        for row in rows:
            post = {
                'post_id': row[0],
                'author_id': row[1],
                'author_name': row[2] if row[2] else "Unknown",
                'content': clean_html(row[3]) if row[3] else "",
                'content_type': row[4] if row[4] else "text",
                'created_at': row[5].isoformat() if row[5] else None,
                'interaction_counts': row[6] if row[6] else {'favorites': 0, 'reblogs': 0, 'replies': 0}
            }
            result.append(post)
        
        # Write to file
        with open(filename, 'w') as f:
            json.dump(result, f, indent=2)
            
        print(f"Exported {len(result)} posts to {filename}")
        
    except Exception as e:
        print(f"Error exporting to JSON: {e}")
    finally:
        conn.close()

# Top posts by engagement
def show_top_posts(limit=10):
    conn = connect_db()
    cur = conn.cursor()
    
    try:
        print(f'\n=== TOP {limit} POSTS BY ENGAGEMENT ===')
        
        cur.execute(f"""
        SELECT post_id, author_name, content, content_type, created_at,
               (interaction_counts->>'favorites')::integer as favs,
               (interaction_counts->>'reblogs')::integer as reblogs,
               (interaction_counts->>'replies')::integer as replies,
               ((interaction_counts->>'favorites')::integer + 
                (interaction_counts->>'reblogs')::integer + 
                (interaction_counts->>'replies')::integer) as total
        FROM post_metadata
        ORDER BY total DESC
        LIMIT {limit}
        """)
        
        rows = cur.fetchall()
        
        for i, row in enumerate(rows):
            post_id = row[0]
            author = row[1] if row[1] else "Unknown"
            content = clean_html(row[2])
            content = (content[:80] + '...') if content and len(content) > 80 else content
            content_type = row[3] if row[3] else "text"
            created_at = row[4]
            favorites = row[5]
            reblogs = row[6]
            replies = row[7]
            total = row[8]
            
            print(f"{i+1}. POST: {post_id} by {author}")
            print(f"   CONTENT: {content}")
            print(f"   TYPE: {content_type} | CREATED: {created_at}")
            print(f"   STATS: ❤️ {favorites} | 🔄 {reblogs} | 💬 {replies} | TOTAL: {total}")
            print('-' * 50)
            
    except Exception as e:
        print(f"Error showing top posts: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Database Cleanup Tool for Post Metadata')
    parser.add_argument('--structure', action='store_true', help='Show database structure')
    parser.add_argument('--sample', type=int, default=5, help='Show sample data (specify count)')
    parser.add_argument('--fix-counts', action='store_true', help='Fix duplicate interaction counts')
    parser.add_argument('--clean', action='store_true', help='Clean up the database')
    parser.add_argument('--export', action='store_true', help='Export database to JSON')
    parser.add_argument('--top', type=int, default=10, help='Show top posts by engagement')
    parser.add_argument('--all', action='store_true', help='Run all operations')
    
    args = parser.parse_args()
    
    # If no args provided, show help
    if len(sys.argv) == 1:
        parser.print_help()
        sys.exit(0)
        
    # Run selected operations
    if args.structure or args.all:
        show_structure()
        
    if args.sample or args.all:
        show_sample(args.sample)
        
    if args.fix_counts or args.all:
        fix_duplicate_counts()
        
    if args.clean or args.all:
        clean_database()
        
    if args.export or args.all:
        export_json()
        
    if args.top or args.all:
        show_top_posts(args.top)