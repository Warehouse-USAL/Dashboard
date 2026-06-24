$BASE_URL = "http://localhost:8090"
$EMAIL    = "warehouse@sw.com"
$PASSWORD = "admin123"

Write-Host "Obteniendo token..."
try {
    $resp  = Invoke-RestMethod -Method POST -Uri "$BASE_URL/auth/login" -ContentType "application/json" -Body "{`"email`":`"$EMAIL`",`"password`":`"$PASSWORD`"}"
    $TOKEN = $resp.token
} catch {
    Write-Host "ERROR: no se pudo conectar con $BASE_URL. Verificar Docker."
    exit 1
}
if (-not $TOKEN) { Write-Host "ERROR: token vacio."; exit 1 }

$payload = $TOKEN.Split('.')[1]
$pad = 4 - ($payload.Length % 4)
if ($pad -ne 4) { $payload += '=' * $pad }
$role = ([System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($payload)) | ConvertFrom-Json).role
Write-Host "Token OK - rol: $role"
Write-Host ""

function Post-SKU {
    param([string]$label, [string]$body)
    Write-Host "Cargando $label..."
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    try {
        Invoke-RestMethod -Method POST -Uri "$BASE_URL/products" -ContentType "application/json" -Headers @{ Authorization = "Bearer $TOKEN" } -Body $bytes | Out-Null
        Write-Host "  -> OK creado"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $msg = ""
        try {
            $s = $_.Exception.Response.GetResponseStream()
            $r = [System.IO.StreamReader]::new($s)
            $msg = $r.ReadToEnd()
            $r.Close()
        } catch {}
        Write-Host "  -> $code : $msg"
    }
}

Post-SKU "SKU-001 Casco de seguridad" '{"sku":"SKU-001","name":"Casco de seguridad","description":"Casco de proteccion industrial.","category":"seguridad","available_stock":85,"max_quantity_per_order":50,"minimum_stock":20}'

Post-SKU "SKU-002 Guantes de nitrilo" '{"sku":"SKU-002","name":"Guantes de nitrilo","description":"Guantes desechables resistentes a quimicos.","category":"seguridad","available_stock":120,"max_quantity_per_order":200,"minimum_stock":50}'

Post-SKU "SKU-003 Paleta hidraulica" '{"sku":"SKU-003","name":"Paleta hidraulica","description":"Paleta elevadora manual 2500 kg.","category":"equipos de carga","available_stock":10,"max_quantity_per_order":5,"minimum_stock":2}'

Post-SKU "SKU-004 Estanteria metalica" '{"sku":"SKU-004","name":"Estanteria metalica","description":"Estante modular 5 niveles para deposito.","category":"almacenamiento","available_stock":30,"max_quantity_per_order":20,"minimum_stock":5}'

Post-SKU "SKU-005 Cinta de embalar" '{"sku":"SKU-005","name":"Cinta de embalar","description":"Cinta adhesiva transparente para cajas.","category":"embalaje","available_stock":350,"max_quantity_per_order":500,"minimum_stock":100}'

Post-SKU "SKU-006 Lector de codigo de barras" '{"sku":"SKU-006","name":"Lector de codigo de barras","description":"Escaner inalambrico 1D/2D USB.","category":"tecnologia","available_stock":20,"max_quantity_per_order":10,"minimum_stock":3}'

Post-SKU "SKU-007 Transpaleta electrica" '{"sku":"SKU-007","name":"Transpaleta electrica","description":"Transpaleta motorizada para pisos planos.","category":"equipos de carga","available_stock":0,"max_quantity_per_order":2,"minimum_stock":1}'

Post-SKU "SKU-008 Pallet de madera" '{"sku":"SKU-008","name":"Pallet de madera","description":"Pallet estandar de madera tratada.","category":"almacenamiento","available_stock":15,"max_quantity_per_order":100,"minimum_stock":30}'

Post-SKU "SKU-009 Chaleco reflectivo" '{"sku":"SKU-009","name":"Chaleco reflectivo","description":"Chaleco alta visibilidad para deposito.","category":"seguridad","available_stock":80,"max_quantity_per_order":100,"minimum_stock":25}'

Post-SKU "SKU-011 Senal de piso mojado" '{"sku":"SKU-011","name":"Senal de piso mojado","description":"Senalizador plegable para pisos humedos.","category":"seguridad","available_stock":50,"max_quantity_per_order":50,"minimum_stock":10}'

Post-SKU "SKU-012 Impresora de etiquetas" '{"sku":"SKU-012","name":"Impresora de etiquetas","description":"Impresora termica para etiquetas de logistica.","category":"tecnologia","available_stock":8,"max_quantity_per_order":5,"minimum_stock":2}'

Post-SKU "SKU-013 Contenedor plastico apilable" '{"sku":"SKU-013","name":"Contenedor plastico apilable","description":"Caja de polipropileno resistente apta para apilar.","category":"almacenamiento","available_stock":60,"max_quantity_per_order":80,"minimum_stock":20}'

Post-SKU "SKU-014 Extintor de polvo ABC" '{"sku":"SKU-014","name":"Extintor de polvo ABC","description":"Extintor portatil quimico seco 4 kg.","category":"seguridad","available_stock":3,"max_quantity_per_order":20,"minimum_stock":5}'

Post-SKU "SKU-015 Carretilla de carga" '{"sku":"SKU-015","name":"Carretilla de carga","description":"Carretilla manual dos ruedas para bultos y cajas.","category":"equipos de carga","available_stock":20,"max_quantity_per_order":10,"minimum_stock":3}'

Post-SKU "SKU-016 Film stretch" '{"sku":"SKU-016","name":"Film stretch","description":"Film extensible para estabilizar cargas en pallets.","category":"embalaje","available_stock":100,"max_quantity_per_order":200,"minimum_stock":40}'

Write-Host ""
Write-Host "Carga completa."
