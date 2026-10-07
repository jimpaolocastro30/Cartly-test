import 'dart:convert';

import 'package:cartly/services/api_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  ApiService serviceWith(MockClientHandler handler) => ApiService(
        baseUrl: 'http://api.test/api',
        userId: 'user-1',
        client: MockClient(handler),
      );

  test('sends the X-User-ID header on every request', () async {
    late http.Request captured;
    final api = serviceWith((request) async {
      captured = request;
      return http.Response(jsonEncode({'items': []}), 200);
    });

    await api.get('/items');

    expect(captured.url.toString(), 'http://api.test/api/items');
    expect(captured.headers['X-User-ID'], 'user-1');
  });

  test('surfaces the backend validation message', () async {
    final api = serviceWith((_) async => http.Response(
          jsonEncode({'statusCode': 400, 'message': 'Item name cannot be empty'}),
          400,
        ));

    expect(
      () => api.post('/items', {'name': '', 'quantity': 1}),
      throwsA(isA<ApiException>()
          .having((e) => e.message, 'message', 'Item name cannot be empty')
          .having((e) => e.statusCode, 'statusCode', 400)),
    );
  });

  test('flags 404 responses as not found', () async {
    final api = serviceWith((_) async => http.Response(
          jsonEncode({'statusCode': 404, 'message': 'Item "x" was not found'}),
          404,
        ));

    expect(
      () => api.patch('/items/x/toggle'),
      throwsA(isA<ApiException>().having((e) => e.isNotFound, 'isNotFound', isTrue)),
    );
  });

  test('handles 204 No Content', () async {
    final api = serviceWith((_) async => http.Response('', 204));
    expect(await api.delete('/items/bought'), isNull);
  });

  test('maps network failures to a friendly ApiException', () async {
    final api = serviceWith((_) async => throw http.ClientException('connection refused'));

    expect(
      () => api.get('/items'),
      throwsA(isA<ApiException>().having((e) => e.statusCode, 'statusCode', isNull)),
    );
  });
}
