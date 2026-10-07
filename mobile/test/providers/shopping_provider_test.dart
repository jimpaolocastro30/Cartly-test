import 'package:cartly/models/shopping_item.dart';
import 'package:cartly/providers/shopping_provider.dart';
import 'package:cartly/repositories/shopping_repository.dart';
import 'package:cartly/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

class MockShoppingRepository extends Mock implements ShoppingRepository {}

const milk = ShoppingItem(id: '1', name: 'Milk', quantity: 2, bought: false);
const bread = ShoppingItem(id: '2', name: 'Bread', quantity: 1, bought: false);
const eggs = ShoppingItem(id: '3', name: 'Eggs', quantity: 6, bought: true);

void main() {
  late MockShoppingRepository repository;
  late ShoppingProvider provider;

  setUp(() {
    repository = MockShoppingRepository();
    provider = ShoppingProvider(repository);
  });

  group('loadItems', () {
    test('exposes a loading state while fetching, then the items', () async {
      when(() => repository.fetchItems()).thenAnswer((_) async => [milk, eggs]);

      final future = provider.loadItems();
      expect(provider.isLoading, isTrue);
      await future;

      expect(provider.isLoading, isFalse);
      expect(provider.items, [milk, eggs]);
      expect(provider.loadError, isNull);
    });

    test('keeps the server order and only groups by bought status', () async {
      when(() => repository.fetchItems()).thenAnswer((_) async => [bread, milk, eggs]);

      await provider.loadItems();

      expect(provider.unboughtItems, [bread, milk]);
      expect(provider.boughtItems, [eggs]);
      expect(provider.hasBoughtItems, isTrue);
    });

    test('exposes an error message on failure, and Retry recovers', () async {
      when(() => repository.fetchItems())
          .thenThrow(const ApiException('Could not reach the server.'));
      await provider.loadItems();
      expect(provider.loadError, 'Could not reach the server.');
      expect(provider.items, isEmpty);

      when(() => repository.fetchItems()).thenAnswer((_) async => [milk]);
      await provider.loadItems();
      expect(provider.loadError, isNull);
      expect(provider.items, [milk]);
    });
  });

  group('mutations', () {
    test('toggle re-fetches so the list reflects database ordering', () async {
      const boughtMilk = ShoppingItem(id: '1', name: 'Milk', quantity: 2, bought: true);
      when(() => repository.toggleItem('1')).thenAnswer((_) async => boughtMilk);
      when(() => repository.fetchItems()).thenAnswer((_) async => [bread, boughtMilk, eggs]);

      final error = await provider.toggleItem(milk);

      expect(error, isNull);
      verify(() => repository.fetchItems()).called(1);
      expect(provider.unboughtItems, [bread]);
      expect(provider.boughtItems, [boughtMilk, eggs]);
    });

    test('add returns the backend validation message', () async {
      when(() => repository.addItem('', 1))
          .thenThrow(const ApiException('Item name cannot be empty', statusCode: 400));
      when(() => repository.fetchItems()).thenAnswer((_) async => []);

      expect(await provider.addItem('', 1), 'Item name cannot be empty');
    });

    test('a missing item returns a clear error and refreshes the list', () async {
      when(() => repository.fetchItems()).thenAnswer((_) async => [milk, bread]);
      await provider.loadItems();

      when(() => repository.deleteItem('1'))
          .thenThrow(const ApiException('Item "1" was not found', statusCode: 404));
      when(() => repository.fetchItems()).thenAnswer((_) async => [bread]);

      expect(await provider.deleteItem(milk), 'Item "1" was not found');
      expect(provider.items, [bread]);
      expect(provider.isBusy, isFalse);
    });

    test('clearBought calls the bulk endpoint once and refreshes', () async {
      when(() => repository.clearBought()).thenAnswer((_) async {});
      when(() => repository.fetchItems()).thenAnswer((_) async => [milk]);

      expect(await provider.clearBought(), isNull);
      verify(() => repository.clearBought()).called(1);
      verifyNever(() => repository.deleteItem(any()));
      expect(provider.items, [milk]);
    });
  });
}
