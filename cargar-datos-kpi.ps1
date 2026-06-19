$BASE_URL = "http://localhost:8090"
$EMAIL    = "warehouse@sw.com"
$PASSWORD = "admin123"

Write-Host "Obteniendo token..."
try {
    $resp  = Invoke-RestMethod -Method POST -Uri "$BASE_URL/auth/login" -ContentType "application/json" -Body "{`"email`":`"$EMAIL`",`"password`":`"$PASSWORD`"}"
    $TOKEN = $resp.token
} catch {
    Write-Host "ERROR: login fallido. Verificar Docker."; exit 1
}
if (-not $TOKEN) { Write-Host "ERROR: token vacio."; exit 1 }
Write-Host "Token OK"

Write-Host ""
Write-Host "Mapeando IDs de productos (todas las paginas)..."
$idMap = @{}
$page  = 0
do {
    try {
        $prodResp = Invoke-RestMethod -Method GET -Uri "$BASE_URL/products?page=$page&size=50" -Headers @{ Authorization = "Bearer $TOKEN" }
    } catch {
        Write-Host "ERROR obteniendo pagina $page"; break
    }
    $lista      = if ($prodResp.products) { $prodResp.products } elseif ($prodResp.content) { $prodResp.content } else { $prodResp }
    $pagTotal   = if ($prodResp.pagination) { $prodResp.pagination.total_pages } elseif ($prodResp.totalPages -gt 0) { $prodResp.totalPages } else { 1 }
    foreach ($p in $lista) {
        $idMap[$p.sku] = $p.id
        Write-Host "  $($p.sku) -> $($p.id)"
    }
    $page++
} while ($page -lt $pagTotal)
Write-Host "Total: $($idMap.Count) productos`n"

function Patch-Stock($sku, $available) {
    $prodId = $idMap[$sku]
    if (-not $prodId) { Write-Host "  [SKIP] $sku no encontrado"; return }
    $body  = "{`"available_stock`":$available}"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    try {
        Invoke-RestMethod -Method PATCH -Uri "$BASE_URL/products/$prodId" -ContentType "application/json" -Headers @{ Authorization = "Bearer $TOKEN" } -Body $bytes | Out-Null
        Write-Host "  -> OK  $sku = $available u"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $msg  = ""
        try { $s = $_.Exception.Response.GetResponseStream(); $r = [System.IO.StreamReader]::new($s); $msg = $r.ReadToEnd(); $r.Close() } catch {}
        Write-Host "  -> $code : $msg"
    }
}

function Post-Order($sku, $qty, $priority, $status) {
    $prodId = $idMap[$sku]
    if (-not $prodId) { Write-Host "  [SKIP] $sku no encontrado"; return }
    $body  = "{`"items`":[{`"product_id`":`"$prodId`",`"sku`":`"$sku`",`"quantity`":$qty}],`"priority`":`"$priority`",`"status`":`"$status`",`"destination_area`":`"A-1`"}"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    try {
        Invoke-RestMethod -Method POST -Uri "$BASE_URL/orders" -ContentType "application/json" -Headers @{ Authorization = "Bearer $TOKEN" } -Body $bytes | Out-Null
        Write-Host "  -> OK  $sku x$qty  [$priority]  [$status]"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $msg  = ""
        try { $s = $_.Exception.Response.GetResponseStream(); $r = [System.IO.StreamReader]::new($s); $msg = $r.ReadToEnd(); $r.Close() } catch {}
        Write-Host "  -> $code : $msg"
    }
}

Write-Host "=== PASO 1: STOCK INICIAL ALTO (necesario para crear ordenes) ==="
Patch-Stock "SKU-001" 500
Patch-Stock "SKU-002" 500
Patch-Stock "SKU-003" 500
Patch-Stock "SKU-004" 500
Patch-Stock "SKU-005" 500
Patch-Stock "SKU-006" 500
Patch-Stock "SKU-007" 500
Patch-Stock "SKU-008" 500
Patch-Stock "SKU-009" 500
Patch-Stock "SKU-016" 500
Patch-Stock "SKU-011" 500
Patch-Stock "SKU-012" 500
Patch-Stock "SKU-013" 500
Patch-Stock "SKU-014" 500
Patch-Stock "SKU-015" 500
Patch-Stock "SKU-016" 500

Write-Host ""
Write-Host "=== PASO 2: ORDENES COMPLETADAS (10) ==="
Post-Order "SKU-005" 50 "alta"  "completed"
Post-Order "SKU-002" 25 "media" "completed"
Post-Order "SKU-001" 15 "alta"  "completed"
Post-Order "SKU-009" 30 "media" "completed"
Post-Order "SKU-008" 40 "baja"  "completed"
Post-Order "SKU-002" 20 "alta"  "completed"
Post-Order "SKU-001" 10 "alta"  "completed"
Post-Order "SKU-001"  8 "media" "completed"
Post-Order "SKU-004"  5 "baja"  "completed"
Post-Order "SKU-003"  3 "media" "completed"

Write-Host ""
Write-Host "=== PASO 2: ORDENES CANCELADAS (3) ==="
Post-Order "SKU-006" 2 "alta"  "cancelled"
Post-Order "SKU-007" 1 "media" "cancelled"
Post-Order "SKU-016" 5 "baja"  "cancelled"

Write-Host ""
Write-Host "=== PASO 2: ORDENES EN PROGRESO (4) ==="
Post-Order "SKU-001"  8 "alta"  "in_progress"
Post-Order "SKU-011" 12 "alta"  "in_progress"
Post-Order "SKU-002" 10 "media" "in_progress"
Post-Order "SKU-003"  4 "baja"  "in_progress"

Write-Host ""
Write-Host "=== PASO 2: ORDENES PENDIENTES (5) ==="
Post-Order "SKU-004"  6 "baja"  "pending"
Post-Order "SKU-012"  2 "media" "pending"
Post-Order "SKU-013" 15 "baja"  "pending"
Post-Order "SKU-014"  3 "alta"  "pending"
Post-Order "SKU-015"  8 "media" "pending"

Write-Host ""
Write-Host "=== PASO 3: STOCK FINAL (valores para KPIs) ==="
Patch-Stock "SKU-007"  0
Patch-Stock "SKU-008" 15
Patch-Stock "SKU-014"  3
Patch-Stock "SKU-001" 85
Patch-Stock "SKU-002" 120
Patch-Stock "SKU-003" 10
Patch-Stock "SKU-004" 30
Patch-Stock "SKU-005" 350
Patch-Stock "SKU-009" 80
Patch-Stock "SKU-016" 100
Patch-Stock "SKU-011" 50
Patch-Stock "SKU-012"  8
Patch-Stock "SKU-013" 60
Patch-Stock "SKU-015" 20
Patch-Stock "SKU-016" 100

Write-Host ""
Write-Host "Carga completa."
Write-Host "  Cumplimiento esperado : ~77%  (10 completadas / 3 canceladas)"
Write-Host "  Top SKUs              : SKU-005 (50u), SKU-002 (45u), SKU-008 (40u)"
Write-Host "  Stock en riesgo       : SKU-007 (agotado), SKU-008 (bajo), SKU-014 (bajo)"
