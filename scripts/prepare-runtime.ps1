param([string]$JavaHome = $env:JAVA_HOME, [string]$MySqlHome = $env:MYSQL_HOME)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$JavaHome) {
    $candidates = Get-ChildItem (Join-Path $projectRoot '.tools/jdk') -Directory -ErrorAction SilentlyContinue
    $JavaHome = ($candidates | Where-Object { Test-Path (Join-Path $_.FullName 'bin/jlink.exe') } | Select-Object -First 1).FullName
}
if (!$JavaHome -and (Get-Command java -ErrorAction SilentlyContinue)) { $JavaHome = Split-Path -Parent (Split-Path -Parent (Get-Command java).Source) }
if (!$MySqlHome -and (Get-Command mysql -ErrorAction SilentlyContinue)) { $MySqlHome = Split-Path -Parent (Split-Path -Parent (Get-Command mysql).Source) }
if (!$JavaHome -or !(Test-Path (Join-Path $JavaHome 'bin/java.exe'))) { throw 'Provide -JavaHome pointing to a Java 21 or Java 25 runtime.' }
if (!$MySqlHome -or !(Test-Path (Join-Path $MySqlHome 'bin/mysqld.exe'))) { throw 'Provide -MySqlHome pointing to a MySQL 8 Windows distribution.' }
$runtimeRoot = Join-Path $projectRoot 'runtime'
New-Item -ItemType Directory -Force $runtimeRoot | Out-Null
$javaTarget = Join-Path $runtimeRoot 'java'
if (!(Test-Path $javaTarget)) {
    if (Test-Path (Join-Path $JavaHome 'bin/jlink.exe')) {
        & (Join-Path $JavaHome 'bin/jlink.exe') --add-modules java.se,jdk.unsupported,jdk.crypto.ec,jdk.localedata,jdk.naming.dns --strip-debug --no-header-files --no-man-pages --output $javaTarget
        if ($LASTEXITCODE -ne 0) { throw 'Java runtime creation failed.' }
    } else {
        New-Item -ItemType Directory -Force $javaTarget | Out-Null
        foreach ($folder in @('bin','lib','conf','legal')) { Copy-Item -LiteralPath (Join-Path $JavaHome $folder) -Destination $javaTarget -Recurse -Force }
        Copy-Item -LiteralPath (Join-Path $JavaHome 'release') -Destination $javaTarget
    }
}
$mysqlTarget = Join-Path $runtimeRoot 'mysql'
New-Item -ItemType Directory -Force $mysqlTarget | Out-Null
if (!(Test-Path (Join-Path $mysqlTarget 'bin/mysqld.exe'))) {
    foreach ($folder in @('bin','lib','share','docs')) {
        $source = Join-Path $MySqlHome $folder
        if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination $mysqlTarget -Recurse -Force }
    }
}
foreach ($name in @('LICENSE','README','LICENSE.txt','README.txt')) {
    $source = Join-Path $MySqlHome $name
    if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination $mysqlTarget -Force }
}
# MySQL needs the Microsoft VC runtime on a clean Windows installation.
# Prefer the application-local DLLs already bundled by the JDK, then installed CRT files.
foreach ($name in @('vcruntime140.dll','vcruntime140_1.dll','msvcp140.dll','msvcp140_1.dll','msvcp140_2.dll','concrt140.dll')) {
    $source = Join-Path $JavaHome "bin/$name"
    if (!(Test-Path $source)) { $source = Join-Path $env:WINDIR "System32/$name" }
    if (!(Test-Path $source)) { throw "Missing redistributable dependency $name; install the Microsoft Visual C++ x64 runtime before packaging." }
    $destination = Join-Path $mysqlTarget "bin/$name"
    if (!(Test-Path $destination)) { Copy-Item -LiteralPath $source -Destination $destination }
}
Write-Output 'Runtime prepared. No existing MySQL data or configuration was copied.'
