$ErrorActionPreference = "Stop"

$taskName = "Abel Bot WhatsApp AutoStart"
$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$startupScript = Join-Path $projectDirectory "start-windows.ps1"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path -LiteralPath $startupScript)) {
    throw "Script startup tidak ditemukan: $startupScript"
}

$powershellPath = Join-Path $PSHOME "powershell.exe"
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startupScript`""
$action = New-ScheduledTaskAction `
    -Execute $powershellPath `
    -Argument $arguments `
    -WorkingDirectory $projectDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal `
    -UserId $currentUser `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Menjalankan Bot Abel WhatsApp dan panel admin melalui PM2 setelah login Windows." `
    -Force | Out-Null

Write-Output "Task '$taskName' berhasil dipasang untuk user $currentUser."
