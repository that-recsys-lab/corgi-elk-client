#!/usr/bin/env python3
import requests
import json
from datetime import datetime

def test_post_logging():
    url = "http://localhost:5002/posts"
    
    # Create a test post with realistic interaction counts
    post_data = {
        "post_id": f"test-post-{int(datetime.now().timestamp())}",
        "author_id": "test-author-123",
        "author_name": "Test User",
        "content": "<p>This is a test post to verify interaction counts are correct</p>",
        "content_type": "text",
        "created_at": datetime.now().isoformat(),
        "interaction_counts": {
            "favorites": 42,
            "reblogs": 17,
            "replies": 8
        }
    }
    
    # Send the request
    print("Sending test post...")
    response = requests.post(url, json=post_data)
    
    # Check the response
    if response.status_code == 201:
        print("✅ Success! Post was logged with status code 201")
        print(f"Response: {response.json()}")
        
        # Now retrieve the post to verify it was saved correctly
        post_id = post_data["post_id"]
        get_url = f"{url}/{post_id}"
        
        get_response = requests.get(get_url)
        if get_response.status_code == 200:
            saved_post = get_response.json()
            print("\n✅ Successfully retrieved the post!")
            print(f"Saved post ID: {saved_post['post_id']}")
            print(f"Author: {saved_post['author_name']}")
            print(f"Interaction counts: {saved_post['interaction_counts']}")
            
            # Verify the counts are correct (not duplicated)
            counts = saved_post['interaction_counts']
            if (counts.get('favorites') == 42 and 
                counts.get('reblogs') == 17 and
                counts.get('replies') == 8):
                print("\n🎉 Interaction counts are correct! No duplication occurred.")
            else:
                print("\n❌ WARNING: Interaction counts don't match what we sent!")
                print(f"Sent: favorites=42, reblogs=17, replies=8")
                print(f"Got: favorites={counts.get('favorites')}, reblogs={counts.get('reblogs')}, replies={counts.get('replies')}")
        else:
            print(f"❌ Failed to retrieve post: {get_response.status_code}")
    else:
        print(f"❌ Failed to log post: {response.status_code}")
        print(f"Response: {response.text}")

if __name__ == "__main__":
    test_post_logging()