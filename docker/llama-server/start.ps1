Write-Host "Avvio llama-server (llama.cpp CUDA) in Docker..." -ForegroundColor Cyan
docker compose -f "$PSScriptRoot/docker-compose.yml" up -d
if ($LASTEXITCODE -eq 0) {
    Write-Host "llama-server avviato! Controllo dei log in corso..." -ForegroundColor Green
    docker logs llama-server --tail 20
} else {
    Write-Host "Errore durante l'avvio di llama-server." -ForegroundColor Red
}

