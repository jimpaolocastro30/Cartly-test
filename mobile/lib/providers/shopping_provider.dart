import 'package:flutter/foundation.dart';

import '../models/shopping_item.dart';
import '../repositories/shopping_repository.dart';
import '../services/api_service.dart';

/// UI state for the shopping list. After every mutation the list is re-fetched
/// so the order shown is always the order returned by the database.
class ShoppingProvider extends ChangeNotifier {
  ShoppingProvider(this._repository);

  final ShoppingRepository _repository;

  List<ShoppingItem> _items = const [];
  bool _isLoading = false;
  bool _isBusy = false;
  String? _loadError;

  List<ShoppingItem> get items => _items;
  bool get isLoading => _isLoading;
  bool get isBusy => _isBusy;
  String? get loadError => _loadError;

  List<ShoppingItem> get unboughtItems => _items.where((i) => !i.bought).toList();
  List<ShoppingItem> get boughtItems => _items.where((i) => i.bought).toList();
  bool get hasBoughtItems => _items.any((i) => i.bought);

  /// Full load with loading/error states (initial load and Retry).
  Future<void> loadItems() async {
    _isLoading = true;
    _loadError = null;
    notifyListeners();
    try {
      _items = await _repository.fetchItems();
    } on ApiException catch (e) {
      _loadError = e.message;
    } catch (_) {
      _loadError = 'Something went wrong while loading your list.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Returns null on success, or a user-facing error message.
  Future<String?> addItem(String name, int quantity) =>
      _mutate(() => _repository.addItem(name, quantity));

  Future<String?> toggleItem(ShoppingItem item) => _mutate(() => _repository.toggleItem(item.id));

  Future<String?> deleteItem(ShoppingItem item) => _mutate(() => _repository.deleteItem(item.id));

  Future<String?> clearBought() => _mutate(_repository.clearBought);

  Future<String?> _mutate(Future<Object?> Function() action) async {
    _isBusy = true;
    notifyListeners();
    String? error;
    try {
      await action();
    } on ApiException catch (e) {
      error = e.message;
    } catch (_) {
      error = 'Something went wrong. Please try again.';
    }

    // Refresh even on failure (e.g. 404) so stale items disappear.
    try {
      _items = await _repository.fetchItems();
      _loadError = null;
    } on ApiException catch (e) {
      error ??= e.message;
    } catch (_) {
      error ??= 'Could not refresh your list.';
    } finally {
      _isBusy = false;
      notifyListeners();
    }
    return error;
  }
}
