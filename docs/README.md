# API Documentation

This directory contains the Swagger/OpenAPI documentation for ACDown Server.

## Files

- `index.html` - Swagger UI interface
- `openapi.yaml` - OpenAPI 3.0 specification (located in project root)
- `README.md` - This file

## API Endpoints

### Authentication
- `GET /api/auth/generate-secret` - Generate TOTP secret
- `POST /api/auth/login` - Login with TOTP code (returns stateless token)

### Configuration
- `GET /api/config` - Get server configuration (no authentication required)

### Proxy
- `POST /api/proxy/analyze` - Analyze remote file and get download parts
- `GET /api/proxy/part/{encryptedParams}` - Download file chunk

## Deployment

The documentation is automatically deployed to GitHub Pages via GitHub Actions when changes are pushed to the `main` branch.

**Live Documentation**: https://lijunjie2232.github.io/acdown-server/

## Local Development

To test the documentation locally, you can open `index.html` in a browser. Note that you may need to serve it via a local HTTP server due to CORS restrictions:

```bash
# Using Python 3
python3 -m http.server 8000

# Using Node.js
npx http-server

# Then visit http://localhost:8000
```

## Updating Documentation

1. Edit `../openapi.yaml` in the project root
2. Commit and push changes to `main`
3. GitHub Actions will automatically deploy the updated documentation

## Key Features

- **Stateless Authentication**: Tokens are self-contained with HMAC signatures, no server-side session storage required
- **Configurable Settings**: Clients can fetch server configuration to optimize downloads
- **Chunked Downloads**: Large files are split into encrypted chunks for efficient downloading
- **Range Request Support**: Optimized for servers that support HTTP range requests
