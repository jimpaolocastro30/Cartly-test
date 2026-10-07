import 'package:cartly/models/shopping_item.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ShoppingItem.fromJson', () {
    test('parses an API item', () {
      final item = ShoppingItem.fromJson({
        'id': 'abc123',
        'name': 'Milk',
        'quantity': 2,
        'bought': false,
        'createdAt': '2026-10-07T10:00:00.000Z',
      });

      expect(item.id, 'abc123');
      expect(item.name, 'Milk');
      expect(item.quantity, 2);
      expect(item.bought, isFalse);
      expect(item.createdAt, DateTime.utc(2026, 10, 7, 10));
    });

    test('tolerates a null createdAt and missing bought', () {
      final item = ShoppingItem.fromJson({
        'id': 'x',
        'name': 'Bread',
        'quantity': 1,
        'createdAt': null,
      });

      expect(item.bought, isFalse);
      expect(item.createdAt, isNull);
    });

    test('round-trips through toJson', () {
      const json = {
        'id': 'abc',
        'name': 'Eggs',
        'quantity': 6,
        'bought': true,
        'createdAt': null,
      };
      expect(ShoppingItem.fromJson(json).toJson(), json);
    });
  });
}
