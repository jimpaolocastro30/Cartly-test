class ShoppingItem {
  const ShoppingItem({
    required this.id,
    required this.name,
    required this.quantity,
    required this.bought,
    this.createdAt,
  });

  final String id;
  final String name;
  final int quantity;
  final bool bought;
  final DateTime? createdAt;

  factory ShoppingItem.fromJson(Map<String, dynamic> json) {
    final createdAt = json['createdAt'];
    return ShoppingItem(
      id: json['id'] as String,
      name: json['name'] as String,
      quantity: (json['quantity'] as num).toInt(),
      bought: json['bought'] as bool? ?? false,
      createdAt: createdAt is String ? DateTime.tryParse(createdAt) : null,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'quantity': quantity,
        'bought': bought,
        'createdAt': createdAt?.toIso8601String(),
      };
}
