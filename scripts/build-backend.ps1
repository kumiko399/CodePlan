param([string]$JavaHome = $env:JAVA_HOME, [switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!$JavaHome) {
    $candidates = Get-ChildItem (Join-Path $projectRoot '.tools/jdk') -Directory -ErrorAction SilentlyContinue
    $JavaHome = ($candidates | Where-Object { Test-Path (Join-Path $_.FullName 'bin/javac.exe') } | Select-Object -First 1).FullName
}
if (!$JavaHome -and (Get-Command java -ErrorAction SilentlyContinue)) { $JavaHome = Split-Path -Parent (Split-Path -Parent (Get-Command java).Source) }
if (!$JavaHome -or !(Test-Path (Join-Path $JavaHome 'bin/java.exe'))) { throw 'Set JAVA_HOME to a Java 21 or Java 25 JDK, or pass -JavaHome.' }
$env:JAVA_HOME = $JavaHome
$maven = Join-Path $projectRoot '.tools/apache-maven-3.9.11/bin/mvn.cmd'
if (!(Test-Path $maven)) { $maven = (Get-Command mvn.cmd -ErrorAction Stop).Source }
$arguments = @('-f', (Join-Path $projectRoot 'backend/pom.xml'), "-Dmaven.repo.local=$projectRoot/.cache/maven", 'package')
if ($SkipTests) { $arguments += '-DskipTests' }
& $maven @arguments
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed.' }
