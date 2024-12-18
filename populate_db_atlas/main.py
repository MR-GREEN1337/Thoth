import os
import asyncio
import aiohttp
import json
from datetime import datetime
from typing import Dict, List, Any
from base64 import b64decode
from pymongo import MongoClient
from dotenv import load_dotenv
from asyncio import Semaphore

# Load environment variables
load_dotenv()

# Configuration
MONGODB_URI = os.environ["MONGODB_ATLAS_URI"]
DB_NAME = os.environ["MONGODB_ATLAS_DB_NAME"]
COLLECTION_NAME = os.environ["MONGODB_ATLAS_COLLECTION_NAME"]
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]

# Rate limiting configuration
MAX_CONCURRENT_REQUESTS = 3
REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=30)

# Only verified repositories that exist and are accessible
VERIFIED_REPOS = {
    "python": [
        {
            "url": "https://github.com/tiangolo/fastapi",
            "name": "fastapi",
            "description": "FastAPI framework, high performance, web APIs",
            "language": "python",
            "stars": 65000,
            "topics": ["api", "async", "python3", "web-framework"],
            "frameworks": ["FastAPI", "Pydantic"]
        },
        {
            "url": "https://github.com/langchain-ai/langchain",
            "name": "langchain",
            "description": "Building LLM applications",
            "language": "python",
            "stars": 75000,
            "topics": ["ai", "llm", "machine-learning", "nlp"],
            "frameworks": ["LangChain"]
        },
        {
            "url": "https://github.com/pytorch/pytorch",
            "name": "pytorch",
            "description": "Deep learning framework",
            "language": "python",
            "stars": 73000,
            "topics": ["deep-learning", "machine-learning", "ai", "neural-networks"],
            "frameworks": ["PyTorch"]
        },
        {
            "url": "https://github.com/huggingface/transformers",
            "name": "transformers",
            "description": "State-of-the-art Machine Learning",
            "language": "python",
            "stars": 115000,
            "topics": ["nlp", "machine-learning", "transformers", "ai"],
            "frameworks": ["PyTorch", "TensorFlow"]
        },
        {
            "url": "https://github.com/scrapy/scrapy",
            "name": "scrapy",
            "description": "Web scraping framework",
            "language": "python",
            "stars": 49000,
            "topics": ["web-scraping", "crawler", "spider", "automation"],
            "frameworks": ["Scrapy"]
        },
        {
            "url": "https://github.com/streamlit/streamlit",
            "name": "streamlit",
            "description": "Web apps for Machine Learning",
            "language": "python",
            "stars": 28000,
            "topics": ["web-apps", "data-science", "ml-apps", "dashboard"],
            "frameworks": ["Streamlit"]
        },
        {
            "url": "https://github.com/django/django",
            "name": "django",
            "description": "Web framework for perfectionists",
            "language": "python",
            "stars": 73000,
            "topics": ["web-framework", "python3", "orm", "mvc"],
            "frameworks": ["Django"]
        },
        {
            "url": "https://github.com/numpy/numpy",
            "name": "numpy",
            "description": "Scientific computing in Python",
            "language": "python",
            "stars": 24000,
            "topics": ["scientific-computing", "arrays", "mathematics", "data-science"],
            "frameworks": ["NumPy"]
        }
    ],
    "typescript": [
        {
            "url": "https://github.com/microsoft/TypeScript",
            "name": "TypeScript",
            "description": "JavaScript with syntax for types",
            "language": "typescript",
            "stars": 94000,
            "topics": ["typescript", "javascript", "compiler", "language"],
            "frameworks": ["TypeScript"]
        },
        {
            "url": "https://github.com/nestjs/nest",
            "name": "nest",
            "description": "Progressive Node.js framework",
            "language": "typescript",
            "stars": 60000,
            "topics": ["nodejs", "typescript", "server", "framework"],
            "frameworks": ["NestJS", "Express"]
        },
        {
            "url": "https://github.com/prisma/prisma",
            "name": "prisma",
            "description": "Next-generation ORM for Node.js & TypeScript",
            "language": "typescript",
            "stars": 34000,
            "topics": ["orm", "database", "typescript", "nodejs"],
            "frameworks": ["Prisma"]
        },
        {
            "url": "https://github.com/trpc/trpc",
            "name": "trpc",
            "description": "End-to-end typesafe APIs",
            "language": "typescript",
            "stars": 30000,
            "topics": ["api", "typescript", "rpc", "full-stack"],
            "frameworks": ["tRPC"]
        },
        {
            "url": "https://github.com/supabase/supabase",
            "name": "supabase",
            "description": "Open source Firebase alternative",
            "language": "typescript",
            "stars": 58000,
            "topics": ["database", "authentication", "realtime", "backend"],
            "frameworks": ["Supabase", "PostgreSQL"]
        },
        {
            "url": "https://github.com/angular/angular",
            "name": "angular",
            "description": "Modern web development platform",
            "language": "typescript",
            "stars": 89000,
            "topics": ["web", "framework", "angular", "spa"],
            "frameworks": ["Angular"]
        },
        {
            "url": "https://github.com/remix-run/remix",
            "name": "remix",
            "description": "Full stack web framework",
            "language": "typescript",
            "stars": 24000,
            "topics": ["web", "framework", "react", "full-stack"],
            "frameworks": ["Remix", "React"]
        },
        {
            "url": "https://github.com/jestjs/jest",
            "name": "jest",
            "description": "JavaScript Testing Framework",
            "language": "typescript",
            "stars": 42000,
            "topics": ["testing", "jest", "javascript", "typescript"],
            "frameworks": ["Jest"]
        }
    ]
}

async def get_file_content(session: aiohttp.ClientSession, repo_url: str, path: str) -> str:
    """Fetch file content from GitHub API with improved error handling."""
    try:
        api_url = repo_url.replace("github.com", "api.github.com/repos") + "/contents/" + path
        headers = {
            "Authorization": f"token {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json"
        }

        async with session.get(api_url, headers=headers, timeout=REQUEST_TIMEOUT) as response:
            if response.status == 404:
                print(f"File not found: {path}")
                return ""
            elif response.status == 403:
                print("Rate limit exceeded, waiting...")
                await asyncio.sleep(60)
                return await get_file_content(session, repo_url, path)
            elif response.status == 200:
                data = await response.json()
                if isinstance(data, dict) and "content" in data:
                    return b64decode(data["content"]).decode('utf-8')
            return ""
    except Exception as e:
        print(f"Error fetching file {path}: {e}")
        return ""

async def process_repo(
    session: aiohttp.ClientSession, 
    repo: Dict[str, Any], 
    semaphore: Semaphore
) -> List[Dict[str, Any]]:
    """Process a single repository and its contents."""
    try:
        async with semaphore:
            api_url = repo["url"].replace("github.com", "api.github.com/repos") + "/contents"
            headers = {
                "Authorization": f"token {GITHUB_TOKEN}",
                "Accept": "application/vnd.github.v3+json"
            }

            async with session.get(api_url, headers=headers, timeout=REQUEST_TIMEOUT) as response:
                if response.status != 200:
                    print(f"Error accessing repo {repo['name']}: {response.status}")
                    return []

                contents = await response.json()
                processed_files = []

                for item in contents:
                    if item["type"] == "file" and item["name"].endswith(
                        (".js", ".ts", ".py", ".java", ".rs", ".go", ".cpp")
                    ):
                        content = await get_file_content(session, repo["url"], item["path"])
                        if content:
                            # Create document for MongoDB
                            doc = {
                                "repo_name": repo["name"],
                                "repo_url": repo["url"],
                                "file_name": item["name"],
                                "file_path": item["path"],
                                "language": repo["language"],
                                "content": content,
                                "topics": repo["topics"],
                                "frameworks": repo["frameworks"],
                                "stars": repo["stars"],
                                "created_at": datetime.now(),
                                "metadata": {
                                    "size": len(content),
                                    "type": "code",
                                    "extension": item["name"].split(".")[-1]
                                }
                            }
                            processed_files.append(doc)

                return processed_files
    except Exception as e:
        print(f"Error processing repo {repo['name']}: {e}")
        return []

async def main():
    """Main function to process all repositories and store in MongoDB."""
    try:
        # Connect to MongoDB
        client = MongoClient(MONGODB_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        
        print("Connected to MongoDB")

        # Create separate indexes for each field
        collection.create_index("content")  # Regular index for content
        collection.create_index("language")  # Regular index for language
        collection.create_index("repo_name")  # Regular index for repo name
        collection.create_index("file_name")  # Regular index for file name
        
        # Create compound index for search optimization
        collection.create_index([
            ("language", 1),
            ("repo_name", 1),
            ("file_name", 1)
        ])

        # Create separate index for array fields
        collection.create_index([("topics", 1)])
        collection.create_index([("frameworks", 1)])
        
        print("Created indexes successfully")

        # Initialize rate limiting
        semaphore = Semaphore(MAX_CONCURRENT_REQUESTS)

        # Process repositories
        async with aiohttp.ClientSession() as session:
            all_repos = []
            for language, repos in VERIFIED_REPOS.items():
                all_repos.extend(repos)

            tasks = []
            for repo in all_repos:
                task = process_repo(session, repo, semaphore)
                tasks.append(task)

            # Process all repos
            results = await asyncio.gather(*tasks)
            
            # Insert documents in batches
            batch_size = 100
            for repo_contents in results:
                if repo_contents:
                    # Insert in smaller batches to avoid memory issues
                    for i in range(0, len(repo_contents), batch_size):
                        batch = repo_contents[i:i + batch_size]
                        if batch:
                            collection.insert_many(batch)
                            print(f"Inserted batch of {len(batch)} documents")

        print("Data ingestion complete")

    except Exception as e:
        print(f"Error in main process: {e}")
        raise

    finally:
        client.close()

if __name__ == "__main__":
    asyncio.run(main())