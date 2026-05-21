# Jarvis AI — one-command dev launcher
# Usage: .\start-dev.ps1
# Starts backend (bun) + frontend (vite) concurrently.
# Open http://localhost:5173 in your browser, or run .\start-dev.ps1 tauri
# to also launch the Tauri shell.

param([switch]$Tauri)

$root = $PSScriptRoot

Write-Host ""
Write-Host "  ╔══════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   JARVIS AI  —  Dev Mode     ║" -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if ($Tauri) {
    # Set MSVC env vars needed for Tauri Rust compilation
    $msvcVer = (Get-ChildItem 'C:\BuildTools\VC\Tools\MSVC' -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty Name)
    if ($msvcVer) {
        $msvcBin = "C:\BuildTools\VC\Tools\MSVC\$msvcVer\bin\Hostx64\x64"
        $sdkVer  = (Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -ErrorAction SilentlyContinue |
                    Where-Object { $_.Name -match '^\d' } | Sort-Object Name -Descending |
                    Select-Object -First 1 -ExpandProperty Name)
        $sdkBin  = "C:\Program Files (x86)\Windows Kits\10\bin\$sdkVer\x64"
        $env:Path    = "$msvcBin;$sdkBin;$env:Path"
        $env:LIB     = "C:\BuildTools\VC\Tools\MSVC\$msvcVer\lib\x64;C:\Program Files (x86)\Windows Kits\10\Lib\$sdkVer\um\x64;C:\Program Files (x86)\Windows Kits\10\Lib\$sdkVer\ucrt\x64"
        $env:INCLUDE = "C:\BuildTools\VC\Tools\MSVC\$msvcVer\include;C:\Program Files (x86)\Windows Kits\10\Include\$sdkVer\ucrt;C:\Program Files (x86)\Windows Kits\10\Include\$sdkVer\um;C:\Program Files (x86)\Windows Kits\10\Include\$sdkVer\shared"
        Write-Host "  MSVC $msvcVer detected" -ForegroundColor DarkGray
    }
    Write-Host "  Starting Tauri dev shell (backend + frontend + Tauri window)..." -ForegroundColor Yellow
    Write-Host ""
    Set-Location "$root\app\tauri"
    npx tauri dev
} else {
    Write-Host "  Starting backend + frontend..." -ForegroundColor Yellow
    Write-Host "  Frontend → http://localhost:5173" -ForegroundColor DarkGray
    Write-Host ""
    Set-Location $root
    npm run dev
}
