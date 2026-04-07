// HoloScript Pipeline — Dispensary Inventory Sync
// Compiles to: Node.js cron job, Python script, or AWS Lambda

pipeline "InventorySync" {
  schedule: "*/5 * * * *"   // every 5 minutes
  timeout: 30s
  retry: { max: 3, backoff: "exponential" }

  source POS {
    type: "rest"
    endpoint: "${env.POS_API_URL}/products"
    auth: { type: "bearer", token: "${env.POS_TOKEN}" }
    method: "GET"
    pagination: { type: "cursor", param: "after", limit: 100 }
  }

  transform MapFields {
    sku       -> productId
    qty       -> stock
    unit_cost -> costCents : multiply(100)
    name      -> displayName : trim() : titleCase()
    category  -> tags : split(",") : trim()
    updated   -> lastSync : toISO()
  }

  filter StockChanged {
    where: stock != previous.stock
        || costCents != previous.costCents
  }

  validate Inventory {
    productId : required, string, minLength(3)
    stock     : required, integer, min(0)
    costCents : required, integer, min(0)
  }

  sink Storefront {
    type: "rest"
    endpoint: "${env.STORE_API}/inventory"
    method: "PATCH"
    batch: { size: 50, parallel: 3 }
    on_error: { action: "log", continue: true }
  }

  sink Analytics {
    type: "webhook"
    endpoint: "${env.ANALYTICS_WEBHOOK}"
    method: "POST"
    body: { event: "inventory_update", count: "${batch.length}" }
  }
}
