$ErrorActionPreference = 'Stop'

Set-Location -LiteralPath $PSScriptRoot

function Step($message) {
  Write-Host ""
  Write-Host $message -ForegroundColor Cyan
}

function Fail($message) {
  Write-Host ""
  Write-Host $message -ForegroundColor Red
  Read-Host "Press Enter to exit"
  exit 1
}

Step "[1/4] Checking .env"
if (-not (Test-Path -LiteralPath ".env")) {
  Fail "Missing .env. Please create it from .env.example first."
}

Step "[2/4] Checking dependencies"
if (-not (Test-Path -LiteralPath "node_modules")) {
  Write-Host "node_modules not found. Running npm install..."
  npm install
  if ($LASTEXITCODE -ne 0) {
    Fail "npm install failed."
  }
}

Step "[3/4] Registering Discord slash commands"
npm run register
if ($LASTEXITCODE -ne 0) {
  Fail "Register failed. Check DISCORD_TOKEN, CLIENT_ID, and GUILD_ID in .env."
}

Step "[4/4] Starting Discord Bot"
npm run start

Write-Host ""
Write-Host "Bot process exited." -ForegroundColor Yellow
Read-Host "Press Enter to exit"
