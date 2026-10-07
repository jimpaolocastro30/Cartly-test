import 'package:flutter/material.dart';

import '../models/shopping_item.dart';

class ShoppingItemTile extends StatelessWidget {
  const ShoppingItemTile({
    super.key,
    required this.item,
    required this.onToggle,
    required this.onDelete,
    this.enabled = true,
  });

  final ShoppingItem item;
  final VoidCallback onToggle;
  final VoidCallback onDelete;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      key: ValueKey('item-${item.id}'),
      enabled: enabled,
      leading: Checkbox(
        value: item.bought,
        onChanged: enabled ? (_) => onToggle() : null,
      ),
      title: Text(
        item.name,
        style: item.bought
            ? theme.textTheme.bodyLarge?.copyWith(
                decoration: TextDecoration.lineThrough,
                color: theme.disabledColor,
              )
            : null,
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('x${item.quantity}', style: theme.textTheme.titleMedium),
          IconButton(
            tooltip: 'Delete ${item.name}',
            icon: const Icon(Icons.delete_outline),
            onPressed: enabled ? onDelete : null,
          ),
        ],
      ),
      onTap: enabled ? onToggle : null,
    );
  }
}
