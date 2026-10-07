import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/shopping_item.dart';
import '../providers/shopping_provider.dart';
import '../widgets/add_item_dialog.dart';
import '../widgets/empty_state.dart';
import '../widgets/error_state.dart';
import '../widgets/shopping_item_tile.dart';

class ShoppingListScreen extends StatefulWidget {
  const ShoppingListScreen({super.key});

  @override
  State<ShoppingListScreen> createState() => _ShoppingListScreenState();
}

class _ShoppingListScreenState extends State<ShoppingListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ShoppingProvider>().loadItems();
    });
  }

  void _showError(String? message) {
    if (message == null || !mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _openAddDialog() async {
    final provider = context.read<ShoppingProvider>();
    await showDialog<void>(
      context: context,
      builder: (_) => AddItemDialog(onSubmit: provider.addItem),
    );
  }

  Future<void> _clearBought(ShoppingProvider provider) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear bought items?'),
        content: const Text('All items marked as bought will be removed.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Clear')),
        ],
      ),
    );
    if (confirmed == true) {
      _showError(await provider.clearBought());
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ShoppingProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cartly'),
        bottom: provider.isBusy
            ? const PreferredSize(
                preferredSize: Size.fromHeight(4),
                child: LinearProgressIndicator(),
              )
            : null,
      ),
      body: _buildBody(provider),
      bottomNavigationBar: provider.items.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 96, 8),
                child: OutlinedButton.icon(
                  key: const Key('clearBoughtButton'),
                  onPressed: provider.hasBoughtItems && !provider.isBusy
                      ? () => _clearBought(provider)
                      : null,
                  icon: const Icon(Icons.cleaning_services_outlined),
                  label: const Text('Clear Bought'),
                ),
              ),
            ),
      floatingActionButton: FloatingActionButton(
        tooltip: 'Add item',
        onPressed: provider.isLoading ? null : _openAddDialog,
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _buildBody(ShoppingProvider provider) {
    if (provider.isLoading && provider.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (provider.loadError != null && provider.items.isEmpty) {
      return ErrorState(message: provider.loadError!, onRetry: provider.loadItems);
    }
    if (provider.items.isEmpty) {
      return RefreshIndicator(
        onRefresh: provider.loadItems,
        child: ListView(children: const [SizedBox(height: 120), EmptyState()]),
      );
    }

    // Grouping only: each group keeps the order returned by the API.
    final unbought = provider.unboughtItems;
    final bought = provider.boughtItems;

    return RefreshIndicator(
      onRefresh: provider.loadItems,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 88),
        children: [
          const _SectionHeader('Shopping List'),
          if (unbought.isEmpty)
            const ListTile(title: Text('Everything is in the cart!'))
          else
            ...unbought.map((item) => _tile(provider, item)),
          if (bought.isNotEmpty) ...[
            const Divider(),
            const _SectionHeader('Bought'),
            ...bought.map((item) => _tile(provider, item)),
          ],
        ],
      ),
    );
  }

  Widget _tile(ShoppingProvider provider, ShoppingItem item) {
    return ShoppingItemTile(
      item: item,
      enabled: !provider.isBusy,
      onToggle: () async => _showError(await provider.toggleItem(item)),
      onDelete: () async => _showError(await provider.deleteItem(item)),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(title, style: Theme.of(context).textTheme.titleSmall),
    );
  }
}
