# Runs the backend (uvicorn --reload) and frontend (vite) dev servers in one console for dev.bat and
# stops both as soon as either one exits, so a half-running setup (backend up, frontend dead or vice
# versa) never lingers. Ctrl+C also stops both (the finally block kills each process tree).
# Kept ASCII-only: Windows PowerShell 5.1 reads BOM-less files in the ANSI codepage.
param(
    [Parameter(Mandatory = $true)][string]$Python,
    [Parameter(Mandatory = $true)][int]$BackendPort,
    [Parameter(Mandatory = $true)][int]$FrontendPort
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$pythonPath = (Resolve-Path $Python).Path

function Stop-Tree($proc) {
    if ($null -ne $proc -and -not $proc.HasExited) {
        # Local 'Continue': under 'Stop', PowerShell 5.1 turns native stderr into a terminating error.
        $ErrorActionPreference = 'Continue'
        & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null
    }
}

# Polls $url for up to ~30s. Fails immediately if the process dies first (import error, npm failure...).
function Wait-UntilUp($proc, [string]$url, [string]$label) {
    for ($i = 0; $i -lt 60; $i++) {
        if ($proc.HasExited) {
            Write-Host "[dev.bat] ERROR: $label exited right after start - see the log above."
            return $false
        }
        try {
            Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2 | Out-Null
            return $true
        } catch {
            # A non-2xx response still means the server is listening.
            if ($null -ne $_.Exception.Response) { return $true }
        }
        Start-Sleep -Milliseconds 500
    }
    Write-Host "[dev.bat] WARNING: $label did not respond at $url within 30s, still waiting."
    return $true
}

$backend = $null
$frontend = $null
try {
    Write-Host "[dev.bat] starting backend (uvicorn --reload) on http://127.0.0.1:$BackendPort"
    # --reload-dir app: without it, watchfiles watches the whole project root (frontend\node_modules,
    # .venv, .git) recursively, causing spurious restarts on Windows.
    $backend = Start-Process -FilePath $pythonPath -NoNewWindow -PassThru -ArgumentList @(
        '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$BackendPort",
        '--reload', '--reload-dir', 'app'
    )
    if (-not (Wait-UntilUp $backend "http://127.0.0.1:$BackendPort/openapi.json" 'backend')) { exit 1 }

    Write-Host "[dev.bat] starting frontend (vite dev server) on http://localhost:$FrontendPort"
    $env:VITE_DEV_PORT = "$FrontendPort"
    $env:VITE_BACKEND_PORT = "$BackendPort"
    $frontend = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' `
        -WorkingDirectory (Join-Path $root 'frontend') -NoNewWindow -PassThru
    if (-not (Wait-UntilUp $frontend "http://localhost:$FrontendPort/" 'frontend')) { exit 1 }

    Write-Host "[dev.bat] ready - open http://localhost:$FrontendPort (frontend/backend edits reload automatically)"
    Write-Host '[dev.bat] Ctrl+C stops both servers; if either one exits, the other is stopped too.'

    while (-not $backend.HasExited -and -not $frontend.HasExited) {
        Start-Sleep -Milliseconds 500
    }
    if ($frontend.HasExited) {
        Write-Host '[dev.bat] frontend exited - stopping backend too.'
    } else {
        Write-Host '[dev.bat] backend exited - stopping frontend too.'
    }
} finally {
    Write-Host '[dev.bat] stopping dev servers...'
    Stop-Tree $backend
    Stop-Tree $frontend
}
exit 1
