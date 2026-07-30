$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$pm2HomeDirectory = Join-Path $projectDirectory ".pm2-local"
$logsDirectory = Join-Path $projectDirectory "logs"
$startupLog = Join-Path $logsDirectory "windows-startup.log"

New-Item -ItemType Directory -Force -Path $logsDirectory | Out-Null
$env:PM2_HOME = $pm2HomeDirectory
Set-Location -LiteralPath $projectDirectory

$pm2Command = Get-Command "pm2.cmd" -ErrorAction SilentlyContinue
if (-not $pm2Command) {
    $fallbackPm2 = Join-Path $env:APPDATA "npm\pm2.cmd"
    if (Test-Path -LiteralPath $fallbackPm2) {
        $pm2Executable = $fallbackPm2
    } else {
        throw "pm2.cmd tidak ditemukan. Jalankan: npm install --global pm2"
    }
} else {
    $pm2Executable = $pm2Command.Source
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] Memulai Bot Abel dari Windows Startup..." |
    Out-File -FilePath $startupLog -Append -Encoding utf8

& $pm2Executable startOrReload ecosystem.config.cjs --update-env *>> $startupLog
if ($LASTEXITCODE -ne 0) {
    throw "PM2 gagal menjalankan ecosystem.config.cjs (exit $LASTEXITCODE)."
}

& $pm2Executable save --force *>> $startupLog
if ($LASTEXITCODE -ne 0) {
    throw "PM2 gagal menyimpan daftar proses (exit $LASTEXITCODE)."
}

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Bot dan panel berhasil dijalankan." |
    Out-File -FilePath $startupLog -Append -Encoding utf8
