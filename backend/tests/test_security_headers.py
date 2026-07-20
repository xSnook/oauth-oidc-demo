from app.security_headers import SECURITY_HEADERS


def test_api_responses_include_security_headers(client):
    response = client.post("/api/auth/microsoft")

    assert response.status_code == 404
    for name, value in SECURITY_HEADERS.items():
        assert response.headers[name] == value


def test_authenticated_route_errors_include_security_headers(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    for name, value in SECURITY_HEADERS.items():
        assert response.headers[name] == value
