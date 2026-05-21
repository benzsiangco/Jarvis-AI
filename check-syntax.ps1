$errors = $null
$tokens = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  "$PSScriptRoot\start-dev.ps1",
  [ref]$tokens,
  [ref]$errors
)
if ($errors.Count -eq 0) {
  Write-Host "SYNTAX OK - start-dev.ps1 is valid" -ForegroundColor Green
} else {
  Write-Host "SYNTAX ERRORS:" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host $_.Message -ForegroundColor Red }
}
