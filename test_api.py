import os
os.environ.setdefault("GAMINGSERVICENP_LOOKUP_URL", "")
from fastapi.testclient import TestClient
from api.index import app

client = TestClient(app)

def test_health_does_not_claim_upstream_is_available():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'running'

def test_invalid_uid_rejected():
    response = client.post('/api/pubg/lookup', json={'uid': 'abc123'})
    assert response.status_code == 422

def test_non_string_uid_rejected():
    response = client.post('/api/pubg/lookup', json={'uid': 51460787300})
    assert response.status_code == 422

def test_missing_upstream_never_fabricates_nickname():
    response = client.post('/api/pubg/lookup', json={'uid': '51460787300'})
    assert response.status_code == 503
    body = response.json()
    assert body['success'] is False
    assert body['nickname'] is None
    assert body['code'] == 'LOOKUP_UNAVAILABLE'

def test_malformed_uid_rejected():
    for uid in ['', '1234', '12345-6', '123456789012345678901']:
        response = client.post('/api/pubg/lookup', json={'uid': uid})
        assert response.status_code == 422

def test_cors_preflight():
    response = client.options('/api/pubg/lookup', headers={
        'Origin': 'http://localhost:8000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
    })
    assert response.status_code == 200
    assert response.headers.get('access-control-allow-origin') == 'http://localhost:8000'
