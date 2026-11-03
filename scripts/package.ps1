param([string]$JavaHome = $env:JAVA_HOME, [string]$MySqlHome = $env:MYSQL_HOME)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build-backend.ps1') -JavaHome $JavaHome
& (Join-Path $PSScriptRoot 'prepare-runtime.ps1') -JavaHome $JavaHome -MySqlHome $MySqlHome
Push-Location $projectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    $env:ELECTRON_CACHE = Join-Path $projectRoot '.cache/electron'
    $env:electron_config_cache = $env:ELECTRON_CACHE
    $env:ELECTRON_BUILDER_CACHE = Join-Path $projectRoot '.cache/electron-builder'
    & node (Join-Path $projectRoot 'desktop/node_modules/electron/install.js')
    if ($LASTEXITCODE -ne 0) { throw 'Electron runtime setup failed.' }
    & npm.cmd --prefix desktop run package
    if ($LASTEXITCODE -ne 0) { throw 'Desktop packaging failed.' }
} finally { Pop-Location }
