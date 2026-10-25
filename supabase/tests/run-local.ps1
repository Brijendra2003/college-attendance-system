# Applies stubs + migrations + seed (+ optional demo data and tests) to a
# throwaway local PostgreSQL database. LOCAL TESTING ONLY.
#   ./supabase/tests/run-local.ps1 -Port 54329 [-Demo] [-Tests]
param(
  [int]$Port = 54329,
  [string]$Database = "cas_test",
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [switch]$Demo,
  [switch]$Tests
)
$ErrorActionPreference = "Continue"
$env:PGOPTIONS = "-c client_min_messages=warning"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$psql = Join-Path $PgBin "psql.exe"
$common = @("-U", "postgres", "-h", "localhost", "-p", "$Port", "-w", "-v", "ON_ERROR_STOP=1", "-q")

& $psql @common -d postgres -c "drop database if exists $Database with (force)" | Out-Null
& $psql @common -d postgres -c "create database $Database" | Out-Null

function Apply($file) {
  $out = & $psql @common -1 -d $Database -o NUL -f $file 2>&1
  if ($LASTEXITCODE -ne 0) {
    $out | ForEach-Object { Write-Host "    $_" }
    throw "failed: $(Split-Path -Leaf $file)"
  }
  $out | Where-Object { "$_" -match "NOTICE|PASS|FAIL" } | ForEach-Object { Write-Host "    $_" }
  Write-Host "  ok  $(Split-Path -Leaf $file)"
}

Apply (Join-Path $root "supabase\tests\00_supabase_stubs.sql")
Get-ChildItem (Join-Path $root "supabase\migrations") -Filter *.sql | Sort-Object Name | ForEach-Object { Apply $_.FullName }
Apply (Join-Path $root "supabase\seed.sql")
if ($Demo) {
  $env:DATABASE_URL = "postgres://postgres@localhost:$Port/$Database"
  Push-Location $root
  npx tsx scripts/seed-demo.ts 2>&1 | ForEach-Object { Write-Host "    $_" }
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { throw "demo seed failed" }
}
if ($Tests) {
  Get-ChildItem (Join-Path $root "supabase\tests") -Filter "test_*.sql" | Sort-Object Name | ForEach-Object { Apply $_.FullName }
}
Write-Host "done: $Database"
