"""Small single-worker hosting boundary: ownership, quotas and upload tickets."""
from contextvars import ContextVar
from contextlib import contextmanager
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import sqlite3
import time
from uuid import uuid4

from fastapi import HTTPException

owner = ContextVar('fretflow_owner', default=None)


def enabled():
    return os.getenv('FRETFLOW_HOSTED') == '1'


def valid_owner(value):
    return isinstance(value, str) and re.fullmatch(r'[a-f0-9]{64}', value) is not None


@contextmanager
def connection(runtime: Path):
    runtime.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(runtime.parent / 'hosting.sqlite3', timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS admissions (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created REAL NOT NULL)')
    db.execute('CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, expires REAL NOT NULL)')
    try:
        with db:
            yield db
    finally:
        db.close()


def admit(runtime: Path, job_id: str, user: str):
    now = time.time()
    with connection(runtime) as db:
        db.execute('BEGIN IMMEDIATE')
        db.execute('DELETE FROM admissions WHERE created < ?', (now - 172800,))
        counts = db.execute('SELECT COUNT(*), COALESCE(SUM(owner = ?), 0) FROM admissions WHERE created > ?', (user, now - 86400)).fetchone()
        if counts[0] >= int(os.getenv('FRETFLOW_DAILY_TOTAL', '50')):
            raise HTTPException(429, 'Daily pilot capacity reached. Please try again tomorrow.')
        if counts[1] >= int(os.getenv('FRETFLOW_DAILY_PER_USER', '2')):
            raise HTTPException(429, 'Your daily analysis limit is reached. Please try again tomorrow.')
        db.execute('INSERT INTO admissions VALUES (?, ?, ?)', (job_id, user, now))


def signed_ticket(user: str, origin: str, path='/api/analyze', method='POST'):
    payload = {'owner': user, 'origin': origin, 'path': path, 'method': method, 'exp': int(time.time()) + 300, 'id': uuid4().hex}
    raw = base64.urlsafe_b64encode(json.dumps(payload, separators=(',', ':')).encode()).rstrip(b'=')
    signature = hmac.new(os.environ['FRETFLOW_WORKER_TOKEN'].encode(), raw, hashlib.sha256).hexdigest()
    return raw.decode() + '.' + signature


def verify_ticket(value: str, method: str, path: str, origin: str | None, runtime: Path):
    try:
        raw, signature = value.split('.')
        expected = hmac.new(os.environ['FRETFLOW_WORKER_TOKEN'].encode(), raw.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise ValueError()
        data = json.loads(base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)))
        if data['exp'] < time.time() or data['method'] != method or data['path'] != path or not valid_owner(data['owner']):
            raise ValueError()
        if origin and origin != data['origin']:
            raise ValueError()
        # Upload capabilities are consumed atomically before reading the body.
        # Downloads remain usable for range requests until their short expiry.
        if method == 'POST':
            with connection(runtime) as db:
                db.execute('DELETE FROM tickets WHERE expires < ?', (time.time(),))
                db.execute('INSERT INTO tickets VALUES (?, ?)', (data['id'], data['exp']))
        return data
    except (ValueError, KeyError, TypeError, sqlite3.IntegrityError):
        raise HTTPException(401, 'Upload authorization expired or already used. Please try again.')


def allowed_origin(value):
    return bool(value) and value in os.getenv('FRETFLOW_ALLOWED_ORIGINS', '').split(',')
