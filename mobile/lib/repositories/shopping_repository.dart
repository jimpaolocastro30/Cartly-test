import '../models/shopping_item.dart';
import '../services/api_service.dart';

/// Maps Cartly API endpoints to domain operations.
class ShoppingRepository {
  ShoppingRepository(this._api);

  final ApiService _api;

  /// Items arrive already ordered by the backend (unbought first, newest first).
  Future<List<ShoppingItem>> fetchItems() async {
    final body = await _api.get('/items') as Map<String, dynamic>;
    final items = body['items'] as List<dynamic>;
    return items.map((e) => ShoppingItem.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<ShoppingItem> addItem(String name, int quantity) async {
    final body = await _api.post('/items', {'name': name, 'quantity': quantity});
    return ShoppingItem.fromJson(body as Map<String, dynamic>);
  }

  Future<ShoppingItem> toggleItem(String id) async {
    final body = await _api.patch('/items/${Uri.encodeComponent(id)}/toggle');
    return ShoppingItem.fromJson(body as Map<String, dynamic>);
  }

  Future<void> deleteItem(String id) => _api.delete('/items/${Uri.encodeComponent(id)}');

  Future<void> clearBought() => _api.delete('/items/bought');
}
