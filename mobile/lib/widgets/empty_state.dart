import 'package:flutter/material.dart';

class EmptyState extends StatelessWidget {
  const EmptyState({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.shopping_cart_outlined, size: 64, color: theme.disabledColor),
            const SizedBox(height: 16),
            Text('Your shopping list is empty', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            const Text('Tap + to add your first item.', textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
