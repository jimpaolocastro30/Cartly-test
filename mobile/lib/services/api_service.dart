import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});

  final String message;

  /// Null when the request never reached the server.
  final int? statusCode;

  bool get isNotFound => statusCode == 404;

  @override
  String toString() => message;
}

/// Thin HTTP client for the Cartly NestJS API. The only class that does HTTP.
class ApiService {
  ApiService({
    required this.baseUrl,
    required this.userId,
    http.Client? client,
    this.timeout = const Duration(seconds: 10),
  }) : _client = client ?? http.Client();

  final String baseUrl;
  final String userId;
  final Duration timeout;
  final http.Client _client;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-User-ID': userId,
      };

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<dynamic> get(String path) => _send(() => _client.get(_uri(path), headers: _headers));

  Future<dynamic> post(String path, Map<String, dynamic> body) => _send(
      () => _client.post(_uri(path), headers: _headers, body: jsonEncode(body)));

  Future<dynamic> patch(String path) => _send(() => _client.patch(_uri(path), headers: _headers));

  Future<dynamic> delete(String path) =>
      _send(() => _client.delete(_uri(path), headers: _headers));

  Future<dynamic> _send(Future<http.Response> Function() request) async {
    final http.Response response;
    try {
      response = await request().timeout(timeout);
    } on TimeoutException {
      throw const ApiException('The server took too long to respond.');
    } on http.ClientException {
      throw const ApiException('Could not reach the server. Check your connection.');
    }

    final body = _decode(response.body);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }
    throw ApiException(_errorMessage(body, response.statusCode),
        statusCode: response.statusCode);
  }

  dynamic _decode(String body) {
    if (body.isEmpty) return null;
    try {
      return jsonDecode(body);
    } on FormatException {
      return null;
    }
  }

  String _errorMessage(dynamic body, int statusCode) {
    if (body is Map && body['message'] != null) {
      final message = body['message'];
      return message is List ? message.join('\n') : message.toString();
    }
    return 'Request failed (HTTP $statusCode).';
  }
}
