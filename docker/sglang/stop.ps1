$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "Arresto del server SGLang..." -ForegroundColor Yellow
docker compose down
Write-Host "Server SGLang arrestato e risorse liberate." -ForegroundColor Green

