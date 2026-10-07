import 'package:cartly/models/shopping_item.dart';
import 'package:cartly/providers/shopping_provider.dart';
import 'package:cartly/repositories/shopping_repository.dart';
import 'package:cartly/screens/shopping_list_screen.dart';
import 'package:cartly/services/api_service.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:provider/provider.dart';

class MockShoppingRepository extends Mock implements ShoppingRepository {}

Widget buildApp(ShoppingRepository repository) => ChangeNotifierProvider(
      create: (_) => ShoppingProvider(repository),
      child: const MaterialApp(home: ShoppingListScreen()),
    );

void main() {
  late MockShoppingRepository repository;

  setUp(() => repository = MockShoppingRepository());

  testWidgets('shows the empty state', (tester) async {
    when(() => repository.fetchItems()).thenAnswer((_) async => []);

    await tester.pumpWidget(buildApp(repository));
    await tester.pumpAndSettle();

    expect(find.text('Your shopping list is empty'), findsOneWidget);
  });

  testWidgets('shows an error with Retry, which reloads the list', (tester) async {
    when(() => repository.fetchItems()).thenThrow(const ApiException('Server unavailable'));

    await tester.pumpWidget(buildApp(repository));
    await tester.pumpAndSettle();
    expect(find.text('Server unavailable'), findsOneWidget);

    when(() => repository.fetchItems()).thenAnswer(
        (_) async => [const ShoppingItem(id: '1', name: 'Milk', quantity: 2, bought: false)]);
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();

    expect(find.text('Milk'), findsOneWidget);
    expect(find.text('x2'), findsOneWidget);
  });

  testWidgets('groups items under Shopping List and Bought', (tester) async {
    when(() => repository.fetchItems()).thenAnswer((_) async => const [
          ShoppingItem(id: '1', name: 'Bread', quantity: 1, bought: false),
          ShoppingItem(id: '2', name: 'Eggs', quantity: 6, bought: true),
        ]);

    await tester.pumpWidget(buildApp(repository));
    await tester.pumpAndSettle();

    expect(find.text('Shopping List'), findsOneWidget);
    expect(find.text('Bought'), findsOneWidget);
    final breadY = tester.getTopLeft(find.text('Bread')).dy;
    final eggsY = tester.getTopLeft(find.text('Eggs')).dy;
    expect(breadY, lessThan(eggsY));
  });
}
