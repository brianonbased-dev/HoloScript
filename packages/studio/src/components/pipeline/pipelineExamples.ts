export interface PipelineExample {
  name: string;
  source: string;
}

export const PIPELINE_EXAMPLES: PipelineExample[] = [
  {
    name: 'Inventory Sync',
    source: `pipeline "InventorySync" {
  source Inventory {
    type: "list"
    items: [{ sku: "A-100", qty: 3 }]
  }

  transform MapFields {
    sku -> productId
    qty -> stock
  }

  sink Out {
    type: "stdout"
  }
}`,
  },
  {
    name: 'Social Monitor',
    source: `pipeline "SocialMonitor" {
  source Feed {
    type: "list"
    items: [
      { author: "agent-1", severity: 2, text: "all good" },
      { author: "agent-2", severity: 9, text: "service degraded" }
    ]
  }

  filter NeedsAttention {
    where: "severity >= 7"
  }

  sink Out {
    type: "stdout"
  }
}`,
  },
];

export const DEFAULT_PIPELINE_SOURCE = PIPELINE_EXAMPLES[0].source;
