import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'providers/shopping_provider.dart';
import 'repositories/shopping_repository.dart';
import 'screens/shopping_list_screen.dart';
import 'services/api_service.dart';

/// Override with --dart-define=API_BASE_URL=... (default targets the Android emulator host).
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:3000/api',
);

/// Stand-in for authentication: sent as the X-User-ID header.
const userId = String.fromEnvironment('USER_ID', defaultValue: 'demo-user');

void main() {
  final api = ApiService(baseUrl: apiBaseUrl, userId: userId);
  runApp(CartlyApp(repository: ShoppingRepository(api)));
}

class CartlyApp extends StatelessWidget {
  const CartlyApp({super.key, required this.repository});

  final ShoppingRepository repository;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => ShoppingProvider(repository),
      child: MaterialApp(
        title: 'Cartly',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorSchemeSeed: Colors.green, useMaterial3: true),
        home: const ShoppingListScreen(),
      ),
    );
  }
}
