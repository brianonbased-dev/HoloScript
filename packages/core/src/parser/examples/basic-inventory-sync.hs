pipeline "InventorySync" {
  source SeedData {
    type: "list"
  }

  transform Normalize {
    sku -> productId
    qty -> stock : multiply(100)
    name -> displayName : trim() : titleCase()
  }

  filter Active {
    where: stock > 0
  }

  validate Product {
    productId: required, string
    stock: required
  }

  sink Out {
    type: "stdout"
  }
}
