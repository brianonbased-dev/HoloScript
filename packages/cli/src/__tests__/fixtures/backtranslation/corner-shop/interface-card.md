Behaviour name: "Corner Shop"

State fields others can see: stock, till

Actions (each answers with allowed and outcome; outcome is one of the names listed):
- buy(quantity, payment) — outcomes: sold, nothing_to_buy, not_enough_stock, not_enough_money; a sold answer also has the field: change
- restock(amount) — outcomes: restocked, nothing_to_add, shelf_full

Observations (answer only):
- inventory(viewerId) — answer fields: viewer, stock, till

Events (event name: payload fields):
- sold: quantity, price
- restocked: amount
