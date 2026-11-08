Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "   AVVIO SERVER SGLANG CON DOCKER (GPU NVIDIA)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "Avvio container con docker compose..." -ForegroundColor Yellow
docker compose up -d

Write-Host "`nContainer avviato in background. Per seguire il log e il download:" -ForegroundColor Green
Write-Host "  docker compose logs -f" -ForegroundColor White
Write-Host "`nOppure esegui lo script: .\logs.ps1" -ForegroundColor Gray

