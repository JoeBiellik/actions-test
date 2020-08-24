const net = require('net');
const http = require('http');
const assert = require('chai').assert;
const parser = require('http-string-parser');
const app = require('../app');

const request = (packet) => {
	return new Promise((resolve, reject) => {
		net.connect(server.address().port, function() {
			this.end(packet);
			this.setEncoding('utf-8');

			let res = '';

			this.on('data', (chunk) => {
				res += chunk;
			});
			this.on('end', () => resolve(res));
			this.on('error', reject);
		});
	});
};

const checkMirror = async (requestData, statusCode, body) => {
	const responseData = await request(requestData);
	const response = parser.parseResponse(responseData);

	assert.equal(response.statusCode, statusCode.toString(), 'status code is 200');
	assert.equal(response.statusMessage, http.STATUS_CODES[statusCode], 'status message is standard');

	assert.equal(response.headers.Connection, 'close', 'connection is set to close');
	assert.equal(response.headers['Cache-Control'], 'no-cache', 'response caching is disabled');
	assert.equal(response.headers['Content-Type'], 'text/plain; charset=utf-8', 'content type is UTF8 text');
	assert.match(response.headers['Content-Length'], /^\d+$/, 'content length is a valid number');
	assert.lengthOf(Object.keys(response.headers), 4, '4 headers are expected');

	assert.equal(response.body, body ?? requestData, 'body mirrors HTTP request verbatim');
};

const server = app.listen(0);

describe('app', () => {
	describe('requests with valid data', () => {
		it('GET request should be mirrored', async () => {
			await checkMirror('GET / HTTP/1.1\r\n\r\n', 200);
		});
		it('POST request should be mirrored', async () => {
			await checkMirror('POST / HTTP/1.1\r\n\r\n', 200);
		});
		it('HEAD request should be mirrored', async () => {
			await checkMirror('HEAD / HTTP/1.1\r\n\r\n', 200);
		});
		it('OPTIONS request should be mirrored', async () => {
			await checkMirror('OPTIONS / HTTP/1.1\r\n\r\n', 200);
		});

		it('request headers should be mirrored', async () => {
			await checkMirror('GET / HTTP/1.1\r\nTest: true\r\nAnother-Header: Some Value\r\n\r\n', 200);
		});

		it('request body should be mirrored', async () => {
			await checkMirror('GET / HTTP/1.1\r\nContent-Length: 4\r\n\r\nBody', 200);
		});
	});

	describe('requests with invalid data', () => {
		it('invalid request method should 400', async () => {
			await checkMirror('BAD / HTTP/1.1\r\n\r\n', 400);
		});
		it('request missing HTTP version should 400', async () => {
			await checkMirror('GET / HTTP\r\n\r\n', 400);
		});
		it('GET request with no URI should 400', async () => {
			await checkMirror('GET\r\n\r\n', 400);
		});

		it('oversized request headers should 431', async () => {
			await checkMirror(`GET / HTTP/1.1\r\nX-Header: ${Buffer.alloc(1025, 'a')}\r\n\r\n`, 431, '431 Request Header Fields Too Large\r\nMaximum total request header size is 1KB (1024 bytes)');
		});
		it('oversized request body with length should 413', async () => {
			await checkMirror(`GET / HTTP/1.1\r\nContent-Length: 1025\r\n\r\n${Buffer.alloc(1025, 'a')}`, 413, '413 Payload Too Large\r\nMaximum request body size is 1KB (1024 bytes)');
		});
		it('oversized chunked request body should 413', async () => {
			await checkMirror(`GET / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n1025\r\n${Buffer.alloc(1025, 'a')}\r\n0\r\n\r\n`, 413, '413 Payload Too Large\r\nMaximum request body size is 1KB (1024 bytes)');
		});
	});
});
