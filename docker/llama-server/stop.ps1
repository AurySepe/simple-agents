Write-Host "Arresto llama-server in corso..." -ForegroundColor Yellow
docker compose -f "$PSScriptRoot/docker-compose.yml" down
Write-Host "llama-server arrestato con successo." -ForegroundColor Green

