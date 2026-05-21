Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 32,32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(124,110,246))
$g.Dispose()
$outPath = Join-Path $PSScriptRoot "app\electron\icon.png"
$bmp.Save($outPath)
$bmp.Dispose()
Write-Host "Icon saved to $outPath" -ForegroundColor Green
