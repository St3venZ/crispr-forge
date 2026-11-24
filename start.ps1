<#
.SYNOPSIS
    CRISPR-Forge Windows 1-Click Launcher (starts FastAPI Backend + Next.js Frontend)
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  CRISPR-Forge | Zero-Trust CRISPR/Cas9 Workbench" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

if (-not (Test-Path $VenvPython)) {
    Write-Host "[ERROR] Python virtual environment not found at $VenvPython" -ForegroundColor Red
    Write-Host "Run: uv venv backend\.venv --python 3.12 && uv pip install --python backend\.venv\Scripts\python.exe -e backend" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "[SETUP] Installing frontend packages (first run only)..." -ForegroundColor Yellow
    Push-Location $FrontendDir
    npm install
    Pop-Location
}

Write-Host "[1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Green
$BackendProc = Start-Process -FilePath $VenvPython `
    -ArgumentList "-m", "uvicorn", "crispr_forge.api.main:app", "--host", "127.0.0.1", "--port", "8000" `
    -WorkingDirectory $BackendDir `
    -PassThru

Write-Host "[2/2] Starting Next.js Scientific Workbench on http://localhost:3000 ..." -ForegroundColor Green
$FrontendProc = Start-Process -FilePath "npm.cmd" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $FrontendDir `
    -PassThru

Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"

Write-Host ""
Write-Host "CRISPR-Forge is running!" -ForegroundColor Cyan
Write-Host "  - Web Workbench : http://localhost:3000"
Write-Host "  - FastAPI Docs  : http://127.0.0.1:8000/docs"
Write-Host "Press Ctrl+C to stop both services." -ForegroundColor Yellow

try {
    Wait-Process -Id $BackendProc.Id, $FrontendProc.Id
} finally {
    if (-not $BackendProc.HasExited) { Stop-Process -Id $BackendProc.Id -Force -ErrorAction SilentlyContinue }
    if (-not $FrontendProc.HasExited) { Stop-Process -Id $FrontendProc.Id -Force -ErrorAction SilentlyContinue }
}
