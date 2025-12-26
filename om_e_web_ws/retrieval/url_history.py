"""
URL History - SQLite-based browsing history with rich metadata.

Tracks all URL visits with chat/project/session context for:
- Provenance tracking (what pages were viewed for a chat)
- Cross-chat queries ("what did I browse Tuesday?")
- Session continuity across chat switches

Schema:
    urls (id, url, title, chat_id, project_id, session_id, ts, action_type)

Usage:
    from retrieval.url_history import log_url, query_urls, get_chat_urls

    # Log a URL visit
    log_url("https://youtube.com", "Video Title", chat_id="abc", project_id="default")

    # Query by chat
    urls = get_chat_urls("abc")

    # Query by date range
    urls = query_urls(start_date="2025-12-24", end_date="2025-12-25")
"""

import sqlite3
import time
from pathlib import Path
from typing import Dict, List, Optional
from contextlib import contextmanager

# Database path
DB_PATH = Path(__file__).parent.parent / "data" / "url_history.db"

# Current session ID (set on server start)
_current_session_id: Optional[str] = None

# Current context (updated as user navigates)
_current_chat_id: Optional[str] = None
_current_project_id: str = "default"


# ============================================================================
# DATABASE SETUP
# ============================================================================

def _get_db_path() -> Path:
    """Get database path, ensuring directory exists."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return DB_PATH


@contextmanager
def _get_connection():
    """Context manager for database connections."""
    conn = sqlite3.connect(_get_db_path())
    conn.row_factory = sqlite3.Row  # Return dicts
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """
    Initialize the database schema.
    Called on server startup. Safe to call multiple times.
    """
    with _get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS urls (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                title TEXT,
                chat_id TEXT,
                project_id TEXT DEFAULT 'default',
                session_id TEXT,
                ts TEXT NOT NULL,
                action_type TEXT DEFAULT 'navigation',
                domain TEXT
            )
        """)

        # Create indexes for common queries
        conn.execute("CREATE INDEX IF NOT EXISTS idx_urls_chat_id ON urls(chat_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_urls_project_id ON urls(project_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_urls_session_id ON urls(session_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_urls_ts ON urls(ts)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_urls_domain ON urls(domain)")

    print("[URLHistory] Database initialized")


# ============================================================================
# SESSION MANAGEMENT
# ============================================================================

def start_session() -> str:
    """
    Start a new browsing session. Called on server startup.
    Returns the session ID.
    """
    global _current_session_id
    _current_session_id = f"sess_{int(time.time())}"
    print(f"[URLHistory] Started session: {_current_session_id}")
    return _current_session_id


def get_current_session_id() -> Optional[str]:
    """Get current session ID."""
    return _current_session_id


def set_current_chat(chat_id: str) -> None:
    """Update current chat context for URL logging."""
    global _current_chat_id
    _current_chat_id = chat_id


def set_current_project(project_id: str) -> None:
    """Update current project context for URL logging."""
    global _current_project_id
    _current_project_id = project_id


def get_current_context() -> Dict:
    """Get current logging context."""
    return {
        "session_id": _current_session_id,
        "chat_id": _current_chat_id,
        "project_id": _current_project_id
    }


# ============================================================================
# URL LOGGING
# ============================================================================

# Track last logged URL to avoid duplicates
_last_logged_url: Optional[str] = None


def _extract_domain(url: str) -> str:
    """Extract domain from URL for indexing."""
    try:
        if "://" in url:
            domain = url.split("://")[1].split("/")[0]
            # Remove www. prefix
            if domain.startswith("www."):
                domain = domain[4:]
            return domain
    except Exception:
        pass
    return ""


def _detect_action_type(url: str) -> str:
    """
    Detect action type from URL patterns.
    Returns: navigation, search, video, docs, social, code, shopping
    """
    url_lower = url.lower()

    # Search patterns
    search_patterns = [
        ("google.com/search", "search"),
        ("bing.com/search", "search"),
        ("duckduckgo.com/?q=", "search"),
        ("youtube.com/results", "search"),
        ("amazon.com/s?", "search"),
        ("github.com/search", "search"),
    ]
    for pattern, action_type in search_patterns:
        if pattern in url_lower:
            return action_type

    # Video patterns
    if "youtube.com/watch" in url_lower or "vimeo.com/" in url_lower:
        return "video"

    # Docs patterns
    if "docs.google.com" in url_lower or "notion.so" in url_lower:
        return "docs"

    # Code patterns
    if "github.com" in url_lower or "gitlab.com" in url_lower:
        return "code"

    # Social patterns
    if any(s in url_lower for s in ["twitter.com", "x.com", "linkedin.com", "reddit.com"]):
        return "social"

    # Shopping patterns
    if any(s in url_lower for s in ["amazon.com", "ebay.com", "etsy.com"]):
        return "shopping"

    return "navigation"


def log_url(
    url: str,
    title: Optional[str] = None,
    chat_id: Optional[str] = None,
    project_id: Optional[str] = None,
    action_type: Optional[str] = None
) -> bool:
    """
    Log a URL visit to the database.

    @param url: The URL visited
    @param title: Page title
    @param chat_id: Override current chat context
    @param project_id: Override current project context
    @param action_type: Override auto-detected action type
    @return: True if logged, False if skipped (duplicate)
    """
    global _last_logged_url

    if not url:
        return False

    # Skip duplicate consecutive URLs
    if url == _last_logged_url:
        return False

    _last_logged_url = url

    # Use provided context or fall back to current
    effective_chat_id = chat_id or _current_chat_id
    effective_project_id = project_id or _current_project_id
    effective_action_type = action_type or _detect_action_type(url)

    domain = _extract_domain(url)
    ts = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

    try:
        with _get_connection() as conn:
            # Dedup: Check if URL+session already exists
            cursor = conn.execute(
                "SELECT 1 FROM urls WHERE url = ? AND session_id = ? LIMIT 1",
                (url, _current_session_id)
            )
            if cursor.fetchone():
                return False  # Already logged this session

            conn.execute("""
                INSERT INTO urls (url, title, chat_id, project_id, session_id, ts, action_type, domain)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                url,
                title or "Untitled",
                effective_chat_id,
                effective_project_id,
                _current_session_id,
                ts,
                effective_action_type,
                domain
            ))

        print(f"[URLHistory] {effective_action_type}: {domain} (chat: {effective_chat_id})")
        return True

    except Exception as e:
        print(f"[URLHistory] Error logging URL: {e}")
        return False


# ============================================================================
# QUERYING
# ============================================================================

def get_chat_urls(chat_id: str, limit: int = 100) -> List[Dict]:
    """
    Get URLs visited while a specific chat was active.
    For provenance tracking.

    @param chat_id: The chat ID to filter by
    @param limit: Maximum results
    @return: List of URL entries
    """
    with _get_connection() as conn:
        cursor = conn.execute("""
            SELECT url, title, ts, action_type, domain
            FROM urls
            WHERE chat_id = ?
            ORDER BY ts DESC
            LIMIT ?
        """, (chat_id, limit))
        return [dict(row) for row in cursor.fetchall()]


def get_project_urls(project_id: str = "default", limit: int = 100) -> List[Dict]:
    """
    Get URLs visited within a project.

    @param project_id: The project ID to filter by
    @param limit: Maximum results
    @return: List of URL entries
    """
    with _get_connection() as conn:
        cursor = conn.execute("""
            SELECT url, title, chat_id, ts, action_type, domain
            FROM urls
            WHERE project_id = ?
            ORDER BY ts DESC
            LIMIT ?
        """, (project_id, limit))
        return [dict(row) for row in cursor.fetchall()]


def get_session_urls(session_id: Optional[str] = None, limit: int = 100) -> List[Dict]:
    """
    Get URLs visited in a browsing session.

    @param session_id: Session ID (defaults to current)
    @param limit: Maximum results
    @return: List of URL entries
    """
    sid = session_id or _current_session_id
    if not sid:
        return []

    with _get_connection() as conn:
        cursor = conn.execute("""
            SELECT url, title, chat_id, ts, action_type, domain
            FROM urls
            WHERE session_id = ?
            ORDER BY ts DESC
            LIMIT ?
        """, (sid, limit))
        return [dict(row) for row in cursor.fetchall()]


def query_urls(
    chat_id: Optional[str] = None,
    project_id: Optional[str] = None,
    session_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    action_type: Optional[str] = None,
    domain: Optional[str] = None,
    search_text: Optional[str] = None,
    limit: int = 100
) -> List[Dict]:
    """
    Flexible query with multiple filters.

    @param chat_id: Filter by chat
    @param project_id: Filter by project
    @param session_id: Filter by session
    @param start_date: Filter by date (YYYY-MM-DD)
    @param end_date: Filter by date (YYYY-MM-DD)
    @param action_type: Filter by action type
    @param domain: Filter by domain (partial match)
    @param search_text: Search in URL or title
    @param limit: Maximum results
    @return: List of URL entries
    """
    conditions = []
    params = []

    if chat_id:
        conditions.append("chat_id = ?")
        params.append(chat_id)

    if project_id:
        conditions.append("project_id = ?")
        params.append(project_id)

    if session_id:
        conditions.append("session_id = ?")
        params.append(session_id)

    if start_date:
        conditions.append("ts >= ?")
        params.append(f"{start_date}T00:00:00Z")

    if end_date:
        conditions.append("ts <= ?")
        params.append(f"{end_date}T23:59:59Z")

    if action_type:
        conditions.append("action_type = ?")
        params.append(action_type)

    if domain:
        conditions.append("domain LIKE ?")
        params.append(f"%{domain}%")

    if search_text:
        conditions.append("(url LIKE ? OR title LIKE ?)")
        params.extend([f"%{search_text}%", f"%{search_text}%"])

    where_clause = " AND ".join(conditions) if conditions else "1=1"
    params.append(limit)

    with _get_connection() as conn:
        cursor = conn.execute(f"""
            SELECT url, title, chat_id, project_id, session_id, ts, action_type, domain
            FROM urls
            WHERE {where_clause}
            ORDER BY ts DESC
            LIMIT ?
        """, params)
        return [dict(row) for row in cursor.fetchall()]


def get_url_stats(chat_id: Optional[str] = None, project_id: Optional[str] = None) -> Dict:
    """
    Get statistics about URL history.

    @param chat_id: Filter by chat
    @param project_id: Filter by project
    @return: Stats dict
    """
    conditions = []
    params = []

    if chat_id:
        conditions.append("chat_id = ?")
        params.append(chat_id)

    if project_id:
        conditions.append("project_id = ?")
        params.append(project_id)

    where_clause = " AND ".join(conditions) if conditions else "1=1"

    with _get_connection() as conn:
        # Total count
        cursor = conn.execute(f"SELECT COUNT(*) as count FROM urls WHERE {where_clause}", params)
        total = cursor.fetchone()["count"]

        # Count by action type
        cursor = conn.execute(f"""
            SELECT action_type, COUNT(*) as count
            FROM urls
            WHERE {where_clause}
            GROUP BY action_type
        """, params)
        action_counts = {row["action_type"]: row["count"] for row in cursor.fetchall()}

        # Top domains
        cursor = conn.execute(f"""
            SELECT domain, COUNT(*) as count
            FROM urls
            WHERE {where_clause} AND domain != ''
            GROUP BY domain
            ORDER BY count DESC
            LIMIT 10
        """, params)
        top_domains = [(row["domain"], row["count"]) for row in cursor.fetchall()]

    return {
        "total_urls": total,
        "action_counts": action_counts,
        "top_domains": top_domains
    }


# ============================================================================
# INITIALIZATION
# ============================================================================

def init_url_history() -> str:
    """
    Initialize URL history system. Called on server startup.
    Returns session ID.
    """
    init_db()
    return start_session()
