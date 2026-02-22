# Create the directory structure
New-Item -ItemType Directory -Force -Path docs\architecture, docs\api, docs\deployment, docs\user-guides
New-Item -ItemType Directory -Force -Path src\voice-conversion\speech-to-text\models, src\voice-conversion\text-to-speech
New-Item -ItemType Directory -Force -Path src\ai-orchestration\nlu\models, src\ai-orchestration\ticket-creation, src\ai-orchestration\duplicate-detection\ml_models
New-Item -ItemType Directory -Force -Path src\rule-engine\rules
New-Item -ItemType Directory -Force -Path src\database\models, src\database\repositories, src\database\migrations
New-Item -ItemType Directory -Force -Path src\storage, src\notification
New-Item -ItemType Directory -Force -Path src\api\routes, src\api\middleware, src\utils
New-Item -ItemType Directory -Force -Path frontend\web-agent\public, frontend\web-agent\src\components, frontend\web-agent\src\pages, frontend\web-agent\src\services
New-Item -ItemType Directory -Force -Path frontend\citizen-app\android, frontend\citizen-app\ios, frontend\citizen-app\src\screens, frontend\citizen-app\src\components, frontend\citizen-app\src\navigation
New-Item -ItemType Directory -Force -Path config
New-Item -ItemType Directory -Force -Path scripts\setup, scripts\data, scripts\deployment
New-Item -ItemType Directory -Force -Path tests\unit, tests\integration, tests\e2e
New-Item -ItemType Directory -Force -Path data\raw, data\processed, data\models, data\audio-samples
New-Item -ItemType Directory -Force -Path ml-models\training, ml-models\evaluation, ml-models\saved-models
New-Item -ItemType Directory -Force -Path .github\workflows, .github\ISSUE_TEMPLATE
New-Item -ItemType Directory -Force -Path notebooks\exploratory, notebooks\prototypes

# Create placeholder files
New-Item -ItemType File -Force -Path README.md, LICENSE, .gitignore, docker-compose.yml, requirements.txt, package.json

Write-Host " Insight311 directory structure created successfully!" -ForegroundColor Green
