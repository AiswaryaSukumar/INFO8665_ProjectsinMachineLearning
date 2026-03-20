# INSIGHT311 Docker Setup

## Where these files go
Copy these files into the project root so the structure becomes:

- docker-compose.yml
- Dockerfile.backend
- Dockerfile.frontend
- .dockerignore
- backend/requirements.docker.txt
- frontend-ui/web-agent/nginx.conf

## Run
From the project root:

```bash
docker compose down
docker compose up --build
```

## URLs
- Frontend: http://localhost:5173
- Backend docs: http://localhost:8311/docs

## Notes
- This setup forces `SKIP_ML_INIT=true` so the backend starts reliably in Docker.
- Your existing `backend/.env` stays where it is.
- The frontend is served by nginx and supports React route refreshes.
